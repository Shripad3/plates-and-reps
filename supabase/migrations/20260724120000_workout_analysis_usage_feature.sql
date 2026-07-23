-- Fix: the workout-analysis usage feature was never added to the
-- ai_usage_events CHECK constraint.
--
-- analyze-workout calls consume_ai_usage_monthly(..., 'workout_analysis', ...),
-- which INSERTs an event with feature = 'workout_analysis'. Because that value
-- was missing from the constraint, the INSERT raised, the RPC errored, and the
-- handler (which only enforces the cap when the RPC did NOT error) skipped the
-- limit entirely — so the free monthly allowance never applied. Add the value
-- to restore the cap.

ALTER TABLE public.ai_usage_events
  DROP CONSTRAINT IF EXISTS ai_usage_events_feature_check;
ALTER TABLE public.ai_usage_events
  ADD CONSTRAINT ai_usage_events_feature_check
  CHECK (feature IN (
    'ai_chat', 'photo_analysis', 'voice_log',
    'food_search', 'rc_sync', 'generate_plan', 'generate_meal_plan',
    'workout_analysis'
  ));
