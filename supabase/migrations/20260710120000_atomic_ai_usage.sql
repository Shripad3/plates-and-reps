-- Atomic AI usage limiting.
--
-- The previous flow counted usage and then inserted an event in two separate
-- statements (check-then-act). Concurrent requests could all pass the count
-- check before any insert landed, letting a user exceed their daily cap with
-- parallel calls. This function does the count + insert under a per-user,
-- per-feature transaction advisory lock, so the whole operation is atomic.
--
-- Called only by trusted service-role edge functions (execute is revoked from
-- anon/authenticated), so passing p_user_id explicitly is safe.

create or replace function public.consume_ai_usage(
  p_user_id uuid,
  p_feature text,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  used integer;
begin
  -- Serialize concurrent calls for this (user, feature) for the txn duration.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_feature, 0));

  select count(*) into used
  from public.ai_usage_events
  where user_id = p_user_id
    and feature = p_feature
    and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';

  if used >= p_limit then
    return false; -- limit reached, nothing recorded
  end if;

  insert into public.ai_usage_events (user_id, feature)
  values (p_user_id, p_feature);

  return true; -- allowed and recorded, atomically
end;
$$;

revoke all on function public.consume_ai_usage(uuid, text, integer) from public;
revoke all on function public.consume_ai_usage(uuid, text, integer) from anon;
revoke all on function public.consume_ai_usage(uuid, text, integer) from authenticated;
grant execute on function public.consume_ai_usage(uuid, text, integer) to service_role;
