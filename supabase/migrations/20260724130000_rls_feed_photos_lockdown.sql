-- Close three RLS holes found in the pre-build-13 audit. In every case a
-- policy meant to grant READ visibility silently granted more:
--   1. activity_feed.feed_visibility was USING-only (no FOR) → it applied to
--      UPDATE/DELETE too, so any user could delete a public feed post and an
--      accepted follower could delete/edit a friends post.
--   2. progress_photos.own_photos had the same USING-only shape → non-owner
--      DELETE of public photos, and (WITH CHECK defaulting to USING) INSERT of
--      rows under another user's id.
--   3. feed_reactions/feed_comments read_* used USING (true) → every reaction
--      and comment (incl. on private / non-connected posts) was world-readable,
--      and inserts were scoped only to the writer, not to feed-item visibility.

-- ─── Shared visibility predicate ───────────────────────────────────────────
-- SECURITY DEFINER so the check evaluates a feed item's visibility without
-- re-triggering activity_feed's own RLS (avoids recursion); auth.uid() still
-- reflects the CALLER, not the definer.
CREATE OR REPLACE FUNCTION public.can_see_feed_item(p_feed_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.activity_feed af
    WHERE af.id = p_feed_item_id
      AND (
        af.user_id = auth.uid()
        OR af.visibility = 'public'
        OR (
          af.visibility = 'friends' AND EXISTS (
            SELECT 1 FROM public.social_connections sc
            WHERE sc.follower_id = auth.uid()
              AND sc.following_id = af.user_id
              AND sc.status = 'accepted'
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_see_feed_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_see_feed_item(uuid) TO authenticated, anon;

-- ─── 1. activity_feed: read-visibility vs. owner-only writes ────────────────
DROP POLICY IF EXISTS "feed_visibility" ON public.activity_feed;
CREATE POLICY "feed_visibility" ON public.activity_feed
  FOR SELECT USING (
    user_id = auth.uid()
    OR visibility = 'public'
    OR (
      visibility = 'friends' AND EXISTS (
        SELECT 1 FROM public.social_connections sc
        WHERE sc.follower_id = auth.uid()
          AND sc.following_id = activity_feed.user_id
          AND sc.status = 'accepted'
      )
    )
  );

-- insert_own_feed already exists; re-assert for idempotency.
DROP POLICY IF EXISTS "insert_own_feed" ON public.activity_feed;
CREATE POLICY "insert_own_feed" ON public.activity_feed
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "update_own_feed" ON public.activity_feed;
CREATE POLICY "update_own_feed" ON public.activity_feed
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "delete_own_feed" ON public.activity_feed;
CREATE POLICY "delete_own_feed" ON public.activity_feed
  FOR DELETE USING (user_id = auth.uid());

-- ─── 2. progress_photos: read-visibility vs. owner-only writes ──────────────
DROP POLICY IF EXISTS "own_photos" ON public.progress_photos;
DROP POLICY IF EXISTS "select_photos" ON public.progress_photos;
CREATE POLICY "select_photos" ON public.progress_photos
  FOR SELECT USING (
    user_id = auth.uid()
    OR visibility = 'public'
    OR (
      visibility = 'friends' AND EXISTS (
        SELECT 1 FROM public.social_connections sc
        WHERE sc.follower_id = auth.uid()
          AND sc.following_id = progress_photos.user_id
          AND sc.status = 'accepted'
      )
    )
  );

DROP POLICY IF EXISTS "insert_own_photos" ON public.progress_photos;
CREATE POLICY "insert_own_photos" ON public.progress_photos
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "update_own_photos" ON public.progress_photos;
CREATE POLICY "update_own_photos" ON public.progress_photos
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "delete_own_photos" ON public.progress_photos;
CREATE POLICY "delete_own_photos" ON public.progress_photos
  FOR DELETE USING (user_id = auth.uid());

-- ─── 3. feed_reactions: read/insert scoped to feed-item visibility ─────────
DROP POLICY IF EXISTS "read_reactions" ON public.feed_reactions;
CREATE POLICY "read_reactions" ON public.feed_reactions
  FOR SELECT USING (
    user_id = auth.uid() OR public.can_see_feed_item(feed_item_id)
  );

DROP POLICY IF EXISTS "own_reactions" ON public.feed_reactions;
CREATE POLICY "own_reactions" ON public.feed_reactions
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND public.can_see_feed_item(feed_item_id)
  );
-- update_own_reactions / delete_own_reactions (owner-scoped) stay as-is; the
-- reaction upsert relies on both the INSERT check above and that UPDATE policy.

-- ─── 3. feed_comments: read/insert scoped to feed-item visibility ──────────
DROP POLICY IF EXISTS "read_comments" ON public.feed_comments;
CREATE POLICY "read_comments" ON public.feed_comments
  FOR SELECT USING (
    user_id = auth.uid() OR public.can_see_feed_item(feed_item_id)
  );

DROP POLICY IF EXISTS "own_comments" ON public.feed_comments;
CREATE POLICY "own_comments" ON public.feed_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND public.can_see_feed_item(feed_item_id)
  );

-- Let users remove their own comments (no DELETE policy existed before).
DROP POLICY IF EXISTS "delete_own_comments" ON public.feed_comments;
CREATE POLICY "delete_own_comments" ON public.feed_comments
  FOR DELETE USING (user_id = auth.uid());
