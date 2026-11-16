-- Manual Web Push pilot test: separate from operational OS events and dispatch.
-- Deliberately does NOT modify any runtime generation/delivery switches.
-- At most 5 sends per user within a rolling 24-hour window, 2-minute spacing.
create table if not exists private.push_pilot_test_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_attempt_at timestamptz not null default pg_catalog.now(),
  window_started_at timestamptz not null default pg_catalog.now(),
  attempt_count integer not null default 1 check (attempt_count between 1 and 5)
);
alter table private.push_pilot_test_attempts enable row level security;
revoke all on private.push_pilot_test_attempts from public,anon,authenticated;
grant select,insert,update on private.push_pilot_test_attempts to service_role;

create or replace function public.push_v4_claim_pilot_test(
  p_user_id uuid, p_endpoint_hash text
)
returns jsonb
language plpgsql security invoker set search_path = ''
as $pilot$
declare
  v_device record;
  v_claimed uuid;
begin
  if p_user_id is null or p_endpoint_hash is null
     or p_endpoint_hash !~ '^[0-9a-f]{64}$'
     or not public.has_module_access(p_user_id,'hub_os')
  then return pg_catalog.jsonb_build_object('status','not_found'); end if;

  -- The endpoint and its encryption keys always come from the authenticated
  -- account's stored, currently active subscription. Never from request JSON.
  select s.endpoint,s.p256dh,s.auth_secret into v_device
  from private.push_subscriptions s
  where s.user_id=p_user_id and s.endpoint_hash=p_endpoint_hash
    and s.revoked_at is null
    and s.last_seen_at>=pg_catalog.now()-interval '90 days';
  if not found then
    return pg_catalog.jsonb_build_object('status','not_found');
  end if;

  -- Atomic per-user rate limit even when two HTTP requests arrive concurrently.
  insert into private.push_pilot_test_attempts
    (user_id,last_attempt_at,window_started_at,attempt_count)
  values (p_user_id,pg_catalog.now(),pg_catalog.now(),1)
  on conflict (user_id) do update
  set last_attempt_at=excluded.last_attempt_at,
      window_started_at=case
        when private.push_pilot_test_attempts.window_started_at<=pg_catalog.now()-interval '24 hours'
        then pg_catalog.now() else private.push_pilot_test_attempts.window_started_at end,
      attempt_count=case
        when private.push_pilot_test_attempts.window_started_at<=pg_catalog.now()-interval '24 hours'
        then 1 else private.push_pilot_test_attempts.attempt_count+1 end
  where private.push_pilot_test_attempts.last_attempt_at<=pg_catalog.now()-interval '2 minutes'
    and (private.push_pilot_test_attempts.window_started_at<=pg_catalog.now()-interval '24 hours'
         or private.push_pilot_test_attempts.attempt_count < 5)
  returning user_id into v_claimed;

  if v_claimed is null then
    return pg_catalog.jsonb_build_object('status','rate_limited');
  end if;

  return pg_catalog.jsonb_build_object(
    'status','ready',
    'endpoint',v_device.endpoint,
    'p256dh',v_device.p256dh,
    'auth_secret',v_device.auth_secret
  );
end;
$pilot$;

revoke all on function public.push_v4_claim_pilot_test(uuid,text)
  from public,anon,authenticated;
grant execute on function public.push_v4_claim_pilot_test(uuid,text) to service_role;
