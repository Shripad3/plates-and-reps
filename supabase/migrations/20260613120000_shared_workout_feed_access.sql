-- Allow friends to read workout sessions/sets linked from shared feed posts

DROP POLICY IF EXISTS "read_shared_workout_sessions" ON public.workout_sessions;
CREATE POLICY "read_shared_workout_sessions" ON public.workout_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.activity_feed af
      WHERE af.reference_id = workout_sessions.id
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
