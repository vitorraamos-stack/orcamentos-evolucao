-- Push V4: manual background test for an explicitly chosen device of the same canary user.
-- No cron, OS event trigger, notification queue, or runtime delivery flag changes.
create table if not exists private.push_pilot_targets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  endpoint_hash text not null check (endpoint_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default pg_catalog.now()
);
alter table private.push_pilot_targets enable row level security;
revoke all on private.push_pilot_targets from public, anon, authenticated;
grant select, insert, update on private.push_pilot_targets to service_role;

-- Only service_role can mark a currently active subscription owned by this user.
create or replace function public.push_v4_set_pilot_target(
  p_user_id uuid, p_endpoint_hash text
)
returns text
language plpgsql security invoker set search_path = ''
as $pilot_target$
begin
  if p_user_id is null or p_endpoint_hash is null
    or p_endpoint_hash !~ '^[0-9a-f]{64}$'
    or not public.has_module_access(p_user_id, 'hub_os') then
    return 'not_found';
  end if;
  if not exists (
    select 1 from private.push_subscriptions s
    where s.user_id = p_user_id and s.endpoint_hash = p_endpoint_hash
      and s.revoked_at is null
      and s.last_seen_at >= pg_catalog.now() - interval '90 days'
  ) then return 'not_found'; end if;

  insert into private.push_pilot_targets (user_id, endpoint_hash, updated_at)
  values (p_user_id, p_endpoint_hash, pg_catalog.now())
  on conflict (user_id) do update
    set endpoint_hash = excluded.endpoint_hash,
        updated_at = excluded.updated_at;
  return 'selected';
end;
$pilot_target$;
revoke all on function public.push_v4_set_pilot_target(uuid,text) from public,anon,authenticated;
grant execute on function public.push_v4_set_pilot_target(uuid,text) to service_role;

-- Reuse the existing atomic cooldown and daily quota. Only the preselected
-- active same-user endpoint can receive a remote-triggered manual test.
create or replace function public.push_v4_claim_remote_pilot_test(p_user_id uuid)
returns jsonb
language plpgsql security invoker set search_path = ''
as $remote_pilot$
declare
  v_hash text;
begin
  if p_user_id is null or not public.has_module_access(p_user_id, 'hub_os') then
    return pg_catalog.jsonb_build_object('status', 'not_found');
  end if;
  select t.endpoint_hash into v_hash
    from private.push_pilot_targets t where t.user_id = p_user_id;
  if v_hash is null then
    return pg_catalog.jsonb_build_object('status', 'target_missing');
  end if;
  return public.push_v4_claim_pilot_test(p_user_id, v_hash);
end;
$remote_pilot$;
revoke all on function public.push_v4_claim_remote_pilot_test(uuid) from public,anon,authenticated;
grant execute on function public.push_v4_claim_remote_pilot_test(uuid) to service_role;
