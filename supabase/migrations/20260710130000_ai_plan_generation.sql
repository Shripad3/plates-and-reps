-- AI plan generation: injury info, server-enforced trial, usage feature fix.

-- 1. Profile columns -------------------------------------------------------
-- injury_info: NULL = not-yet-collected. Otherwise a jsonb object with a
--   "status" of 'skipped' or 'provided' plus structured fields.
-- ai_trial_started_at: NULL until the first successful, validated generation.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS injury_info jsonb,
  ADD COLUMN IF NOT EXISTS ai_trial_started_at timestamptz;

-- 2. Protect ai_trial_started_at from client tampering ---------------------
-- Extends the existing premium guard: a modified client must not be able to
-- start, reset, or extend the trial via a direct profile UPDATE. injury_info
-- stays user-editable (users set their own injuries).
CREATE OR REPLACE FUNCTION public.prevent_premium_self_grant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.id THEN
    IF NEW.is_premium IS DISTINCT FROM OLD.is_premium
      OR NEW.premium_until IS DISTINCT FROM OLD.premium_until THEN
      NEW.is_premium := OLD.is_premium;
      NEW.premium_until := OLD.premium_until;
    END IF;
    -- Trial timestamp is server-managed only.
    IF NEW.ai_trial_started_at IS DISTINCT FROM OLD.ai_trial_started_at THEN
      NEW.ai_trial_started_at := OLD.ai_trial_started_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Fix ai_usage_events feature enum --------------------------------------
-- The original CHECK omitted food_search/rc_sync (so those inserts failed
-- silently and those limits never recorded). Add them plus generate_plan.
ALTER TABLE public.ai_usage_events
  DROP CONSTRAINT IF EXISTS ai_usage_events_feature_check;
ALTER TABLE public.ai_usage_events
  ADD CONSTRAINT ai_usage_events_feature_check
  CHECK (feature IN (
    'ai_chat', 'photo_analysis', 'voice_log',
    'food_search', 'rc_sync', 'generate_plan'
  ));

-- 4. Atomically start the trial (service-role only) ------------------------
-- Sets ai_trial_started_at = now() only if still NULL, and returns the
-- effective value. Idempotent: a second call returns the original timestamp
-- and never resets it. Called by the generate-plan function ONLY after a
-- successful, validated generation.
CREATE OR REPLACE FUNCTION public.start_ai_trial(p_user_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  started timestamptz;
BEGIN
  UPDATE public.user_profiles
  SET ai_trial_started_at = COALESCE(ai_trial_started_at, now()),
      updated_at = now()
  WHERE id = p_user_id
  RETURNING ai_trial_started_at INTO started;
  RETURN started;
END;
$$;

REVOKE ALL ON FUNCTION public.start_ai_trial(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_ai_trial(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.start_ai_trial(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.start_ai_trial(uuid) TO service_role;
