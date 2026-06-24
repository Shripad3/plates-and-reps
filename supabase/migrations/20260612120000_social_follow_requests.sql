-- Follow requests: pending until the followed user accepts

ALTER TABLE public.social_connections
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'accepted'
  CHECK (status IN ('pending', 'accepted', 'declined'));

-- Tighten RLS for request flow
DROP POLICY IF EXISTS "own_connections" ON public.social_connections;
DROP POLICY IF EXISTS "read_own_connections" ON public.social_connections;
DROP POLICY IF EXISTS "insert_follow_requests" ON public.social_connections;
DROP POLICY IF EXISTS "delete_own_connections" ON public.social_connections;
DROP POLICY IF EXISTS "respond_to_follow_requests" ON public.social_connections;

CREATE POLICY "read_own_connections" ON public.social_connections
  FOR SELECT USING (follower_id = auth.uid() OR following_id = auth.uid());

CREATE POLICY "insert_follow_requests" ON public.social_connections
  FOR INSERT WITH CHECK (
    follower_id = auth.uid()
    AND following_id <> auth.uid()
    AND status = 'pending'
  );

CREATE POLICY "delete_own_connections" ON public.social_connections
  FOR DELETE USING (follower_id = auth.uid() OR following_id = auth.uid());

CREATE POLICY "respond_to_follow_requests" ON public.social_connections
  FOR UPDATE USING (following_id = auth.uid() AND status = 'pending')
  WITH CHECK (following_id = auth.uid() AND status IN ('accepted', 'declined'));

-- Feed: only show activity from accepted follows
DROP POLICY IF EXISTS "feed_visibility" ON public.activity_feed;
CREATE POLICY "feed_visibility" ON public.activity_feed
  USING (
    user_id = auth.uid()
    OR visibility = 'public'
    OR (
      visibility = 'friends' AND
      EXISTS (
        SELECT 1 FROM public.social_connections
        WHERE follower_id = auth.uid()
          AND following_id = activity_feed.user_id
          AND status = 'accepted'
      )
    )
  );
