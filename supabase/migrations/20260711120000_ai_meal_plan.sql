-- AI Meal Plan: generalize the trial system, add allergens to foods, add diet_info.

-- 1. Per-feature trial table --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_trials (
  user_id    uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  feature    text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature)
);

ALTER TABLE public.ai_trials ENABLE ROW LEVEL SECURITY;
-- Read-only for the owner (for trial-countdown UI). Writes happen only through
-- the service-role RPC below, so a client can't start/reset/extend a trial.
DROP POLICY IF EXISTS "read_own_ai_trials" ON public.ai_trials;
CREATE POLICY "read_own_ai_trials" ON public.ai_trials
  FOR SELECT USING (user_id = auth.uid());

-- 2. start_ai_trial(user_id, feature) — idempotent, service-role only ---------
DROP FUNCTION IF EXISTS public.start_ai_trial(uuid);

CREATE OR REPLACE FUNCTION public.start_ai_trial(p_user_id uuid, p_feature text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  started timestamptz;
BEGIN
  INSERT INTO public.ai_trials (user_id, feature, started_at)
  VALUES (p_user_id, p_feature, now())
  ON CONFLICT (user_id, feature) DO NOTHING;

  SELECT started_at INTO started
  FROM public.ai_trials
  WHERE user_id = p_user_id AND feature = p_feature;

  RETURN started;
END;
$$;

REVOKE ALL ON FUNCTION public.start_ai_trial(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_ai_trial(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.start_ai_trial(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.start_ai_trial(uuid, text) TO service_role;

-- 3. Backfill existing workout trials into the new table ----------------------
INSERT INTO public.ai_trials (user_id, feature, started_at)
SELECT id, 'workout', ai_trial_started_at
FROM public.user_profiles
WHERE ai_trial_started_at IS NOT NULL
ON CONFLICT (user_id, feature) DO NOTHING;

-- 4. Drop the per-column trial guard from the profile trigger -----------------
-- (ai_trial_started_at is going away; premium fields stay guarded.)
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
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Drop the old single-trial column ----------------------------------------
ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS ai_trial_started_at;

-- 6. Allergens on foods (drives the deterministic hard-filter) ----------------
-- Canonical vocabulary: milk, eggs, peanuts, tree_nuts, soy, wheat_gluten,
-- fish, shellfish, sesame. '{}' means "known to have none"; NULL is unknown.
ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS allergens text[];

-- 7. Dietary profile on the user -------------------------------------------
-- NULL = not-yet-collected; otherwise { status: 'skipped'|'provided', ... }.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS diet_info jsonb;

-- 8. Allow the meal-plan usage feature (daily safety cap) ---------------------
ALTER TABLE public.ai_usage_events
  DROP CONSTRAINT IF EXISTS ai_usage_events_feature_check;
ALTER TABLE public.ai_usage_events
  ADD CONSTRAINT ai_usage_events_feature_check
  CHECK (feature IN (
    'ai_chat', 'photo_analysis', 'voice_log',
    'food_search', 'rc_sync', 'generate_plan', 'generate_meal_plan'
  ));

-- 9. Saved meal plans (first-class records, independent of trial state) -------
-- The full validated plan (days → meals → foods, with DB-computed macros) is
-- stored as jsonb so it stays viewable/loggable after a trial ends.
CREATE TABLE IF NOT EXISTS public.meal_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  name            text NOT NULL,
  target_calories integer,
  plan            jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_meal_plans" ON public.meal_plans;
CREATE POLICY "own_meal_plans" ON public.meal_plans
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS meal_plans_user_created
  ON public.meal_plans (user_id, created_at DESC);
