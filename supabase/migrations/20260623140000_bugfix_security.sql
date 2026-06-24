-- Bugfix: security hardening from audit (feed IDOR, templates, feed insert)

-- ─── Fix shared workout IDOR: feed poster must own the workout ───────────────
DROP POLICY IF EXISTS "read_shared_workout_sessions" ON public.workout_sessions;
CREATE POLICY "read_shared_workout_sessions" ON public.workout_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.activity_feed af
      WHERE af.reference_id = workout_sessions.id
        AND af.user_id = workout_sessions.user_id
        AND af.activity_type = 'workout_completed'
        AND af.visibility IN ('public', 'friends')
        AND (
          af.visibility = 'public'
          OR EXISTS (
            SELECT 1 FROM public.social_connections sc
            WHERE sc.follower_id = auth.uid()
              AND sc.following_id = af.user_id
              AND sc.status = 'accepted'
          )
        )
    )
  );

DROP POLICY IF EXISTS "read_shared_workout_sets" ON public.workout_sets;
CREATE POLICY "read_shared_workout_sets" ON public.workout_sets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workout_sessions ws
      JOIN public.activity_feed af ON af.reference_id = ws.id
      WHERE ws.id = workout_sets.session_id
        AND af.user_id = ws.user_id
        AND af.activity_type = 'workout_completed'
        AND af.visibility IN ('public', 'friends')
        AND (
          af.visibility = 'public'
          OR EXISTS (
            SELECT 1 FROM public.social_connections sc
            WHERE sc.follower_id = auth.uid()
              AND sc.following_id = af.user_id
              AND sc.status = 'accepted'
          )
        )
    )
  );

-- ─── Allow users to publish their own feed items ───────────────────────────
DROP POLICY IF EXISTS "insert_own_feed" ON public.activity_feed;
CREATE POLICY "insert_own_feed" ON public.activity_feed
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Validate workout feed posts reference the author's session
CREATE OR REPLACE FUNCTION public.validate_feed_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.activity_type = 'workout_completed' AND NEW.reference_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.workout_sessions ws
      WHERE ws.id = NEW.reference_id
        AND ws.user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'feed reference must belong to the posting user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_feed_reference_trigger ON public.activity_feed;
CREATE TRIGGER validate_feed_reference_trigger
  BEFORE INSERT OR UPDATE ON public.activity_feed
  FOR EACH ROW EXECUTE FUNCTION public.validate_feed_reference();

-- ─── Public templates: read-only for non-owners ────────────────────────────
DROP POLICY IF EXISTS "own_templates" ON public.workout_templates;
DROP POLICY IF EXISTS "select_templates" ON public.workout_templates;
DROP POLICY IF EXISTS "update_own_templates" ON public.workout_templates;
DROP POLICY IF EXISTS "delete_own_templates" ON public.workout_templates;
CREATE POLICY "select_templates" ON public.workout_templates
  FOR SELECT USING (user_id = auth.uid() OR is_public = true);
CREATE POLICY "update_own_templates" ON public.workout_templates
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "delete_own_templates" ON public.workout_templates
  FOR DELETE USING (user_id = auth.uid());

-- ─── Feed reactions: allow changing reaction type ──────────────────────────
DROP POLICY IF EXISTS "update_own_reactions" ON public.feed_reactions;
CREATE POLICY "update_own_reactions" ON public.feed_reactions
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ─── Progress photos: require accepted follow (match feed policy) ──────────
DROP POLICY IF EXISTS "own_photos" ON public.progress_photos;
CREATE POLICY "own_photos" ON public.progress_photos
  USING (
    user_id = auth.uid()
    OR visibility = 'public'
    OR (
      visibility = 'friends'
      AND EXISTS (
        SELECT 1 FROM public.social_connections sc
        WHERE sc.follower_id = auth.uid()
          AND sc.following_id = progress_photos.user_id
          AND sc.status = 'accepted'
      )
    )
  );

-- ─── Foods catalog: clients may only insert user-owned foods ───────────────
DROP POLICY IF EXISTS "insert_own_foods" ON public.foods;
CREATE POLICY "insert_own_foods" ON public.foods
  FOR INSERT WITH CHECK (created_by = auth.uid());

-- ─── Private challenges: only join public or own challenges ────────────────
DROP POLICY IF EXISTS "own_participation" ON public.challenge_participants;
DROP POLICY IF EXISTS "select_own_participation" ON public.challenge_participants;
DROP POLICY IF EXISTS "insert_challenge_participation" ON public.challenge_participants;
DROP POLICY IF EXISTS "update_own_participation" ON public.challenge_participants;
DROP POLICY IF EXISTS "delete_own_participation" ON public.challenge_participants;
CREATE POLICY "select_own_participation" ON public.challenge_participants
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "insert_challenge_participation" ON public.challenge_participants
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.challenges c
      WHERE c.id = challenge_id
        AND (c.is_public = true OR c.created_by = auth.uid())
    )
  );
CREATE POLICY "update_own_participation" ON public.challenge_participants
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "delete_own_participation" ON public.challenge_participants
  FOR DELETE USING (user_id = auth.uid());
