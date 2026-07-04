-- ─── Stop leaking PII (date_of_birth, sex, height_cm, premium status) via ──
-- ─── the "users_view_others" SELECT(true) policy on user_profiles ─────────
--
-- Previously any authenticated client could read every column of every
-- user's row directly via the Supabase client. Replace the blanket policy
-- with a public_profiles view exposing only the columns the app's social
-- features actually need, and restrict the base table to owner-only access.
-- The view is owned by the migration role, which is exempt from its own
-- table's RLS policies by default (no FORCE ROW LEVEL SECURITY is set),
-- so it can still return every row while exposing only safe columns.

DROP POLICY IF EXISTS "users_view_others" ON public.user_profiles;

CREATE OR REPLACE VIEW public.public_profiles AS
SELECT id, username, display_name, avatar_url
FROM public.user_profiles;

GRANT SELECT ON public.public_profiles TO authenticated, anon;
