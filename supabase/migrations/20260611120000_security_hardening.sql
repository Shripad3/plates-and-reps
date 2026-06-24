-- Security hardening for production launch

-- Prevent users from self-granting premium via client UPDATE
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

DROP TRIGGER IF EXISTS user_profiles_premium_guard ON public.user_profiles;
CREATE TRIGGER user_profiles_premium_guard
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_premium_self_grant();

-- Track AI API invocations (not just saved logs)
CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  feature    text NOT NULL CHECK (feature IN ('ai_chat', 'photo_analysis', 'voice_log')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_events_user_feature_created
  ON public.ai_usage_events (user_id, feature, created_at DESC);

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own usage (for optional client display)
CREATE POLICY "read_own_ai_usage" ON public.ai_usage_events
  FOR SELECT USING (user_id = auth.uid());

-- feed_reactions: allow users to remove their own reactions
CREATE POLICY "delete_own_reactions" ON public.feed_reactions
  FOR DELETE USING (user_id = auth.uid());

-- Service-role function to grant premium (RevenueCat webhook)
CREATE OR REPLACE FUNCTION public.set_user_premium(
  p_user_id uuid,
  p_is_premium boolean,
  p_premium_until timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_profiles
  SET
    is_premium = p_is_premium,
    premium_until = p_premium_until,
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_premium(uuid, boolean, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_premium(uuid, boolean, timestamptz) TO service_role;
