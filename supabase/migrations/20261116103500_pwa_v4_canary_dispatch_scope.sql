-- EvoluSystem PWA V4: canary-scope the entire delivery pipeline.
-- Do not enable generation/delivery flags here; this migration is inert until enabled.
-- The existing, unrestricted service-role RPCs are intentionally deauthorized
-- to ensure a stale deployment can never bypass pilot restrictions.
create or replace function public.push_v4_expand_canary_outbox(p_limit integer, p_allowed_user_ids uuid[])
returns table (expanded_events integer, created_jobs integer)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_evt record;
  v_candidate record;
  v_notice_id uuid;
  v_events integer := 0;
  v_jobs integer := 0;
  v_added_jobs integer := 0;
begin
  -- Reject malformed pilot lists even if a privileged client passes them.
  if p_allowed_user_ids is null
    or pg_catalog.cardinality(p_allowed_user_ids) not between 1 and 5
    or (select pg_catalog.count(*) from pg_catalog.unnest(p_allowed_user_ids) a(id)
        where a.id is null) > 0
    or (select pg_catalog.count(distinct a.id) from pg_catalog.unnest(p_allowed_user_ids) a(id))
       <> pg_catalog.cardinality(p_allowed_user_ids)
  then
    return query select 0,0;
    return;
  end if;

  if not exists (
    select 1 from private.push_v4_runtime_settings
    where singleton and generation_enabled
  ) then
    return query select 0,0;
    return;
  end if;

  for v_evt in
    select e.* from private.notification_source_outbox e
    where e.state='pending' and e.retry_at <= pg_catalog.now()
    order by e.recorded_at, e.id
    for update skip locked
    limit least(greatest(coalesce(p_limit,1),1),25)
  loop
    -- Orders may have been archived or deleted since the source transition.
    if v_evt.required_module is null or not exists (
      select 1 from public.os_orders o
      where o.id=v_evt.order_id and o.archived=false
    ) then
      update private.notification_source_outbox
      set state='discarded',last_error_code='source_unavailable'
      where id=v_evt.id;
      continue;
    end if;

    for v_candidate in
      select distinct x.user_id
      from (
        -- New owner: must remain assigned at delivery time.
        select a.user_id from public.os_order_assignees a
        where v_evt.event_kind='assignment'
          and a.order_id=v_evt.order_id
          and a.id=v_evt.source_object_id
          and a.user_id=v_evt.recipient_hint_id
          and (case
            when upper(a.scope)='ART' then 'hub_os_arte'
            when upper(a.scope) in ('PRODUCTION','FINISHING') then 'hub_os_producao'
            when upper(a.scope)='INSTALLATION' then 'hub_os_instalacoes'
            when upper(a.scope)='GENERAL' then 'hub_os'
            else null
          end)=v_evt.required_module
        union all
        -- Departmental inbox, no commercial users without the module.
        select m.user_id from public.user_module_access m
        where v_evt.event_kind='art_inbox'
          and v_evt.required_module='hub_os_arte'
          and m.module_key='hub_os_arte'
          and exists(select 1 from public.os_orders o
                     where o.id=v_evt.order_id and o.art_status='Caixa de Entrada')
        union all
        select m.user_id from public.user_module_access m
        where v_evt.event_kind='production_released'
          and v_evt.required_module='hub_os_producao'
          and m.module_key='hub_os_producao'
          and exists(select 1 from public.os_orders o
                     where o.id=v_evt.order_id and o.art_status='Produzir')
        union all
        select i.responsible_id from public.os_installations i
        where v_evt.event_kind in ('installation_scheduled','installation_rescheduled')
          and i.id=v_evt.source_object_id
          and i.os_id=v_evt.order_id
          and i.status='SCHEDULED'
        union all
        select m.user_id
        from public.os_installations i
        join public.os_installation_team_members m on m.team_id=i.team_id
        where v_evt.event_kind in ('installation_scheduled','installation_rescheduled')
          and i.id=v_evt.source_object_id
          and i.os_id=v_evt.order_id
          and i.status='SCHEDULED'
      ) x
      where x.user_id is not null
        and x.user_id = any(p_allowed_user_ids)
        and exists(select 1 from public.profiles p where p.id=x.user_id)
        and public.has_module_access(x.user_id,'hub_os')
        and public.has_module_access(x.user_id,v_evt.required_module)
      limit 40
    loop
      insert into public.user_notifications
        (source_event_id,recipient_id,kind,required_module,resource_id)
      values
        (v_evt.id,v_candidate.user_id,v_evt.event_kind,
         v_evt.required_module,v_evt.order_id)
      on conflict (source_event_id,recipient_id) do nothing
      returning id into v_notice_id;

      if v_notice_id is null then
        select n.id into v_notice_id from public.user_notifications n
        where n.source_event_id=v_evt.id and n.recipient_id=v_candidate.user_id;
      end if;

      if v_notice_id is not null then
        with added as (
          insert into private.push_delivery_jobs(notification_id,subscription_id)
          select v_notice_id,s.id
          from private.push_subscriptions s
          where s.user_id=v_candidate.user_id
            and s.revoked_at is null
            and s.last_seen_at >= pg_catalog.now()- interval '90 days'
          on conflict (notification_id,subscription_id) do nothing
          returning id
        )
        select count(*) into v_added_jobs from added;
        v_jobs := v_jobs + v_added_jobs;
      end if;
      v_notice_id := null;
    end loop;

    update private.notification_source_outbox
    set state='completed',last_error_code=null
    where id=v_evt.id;
    v_events := v_events+1;
  end loop;
  return query select v_events,v_jobs;
end;
$$;


create or replace function public.push_v4_claim_canary_jobs(p_limit integer, p_allowed_user_ids uuid[])
returns table (
  job_id uuid, kind text, order_id uuid, endpoint text,
  p256dh text, auth_secret text, attempt_number integer
)
language plpgsql security invoker set search_path=''
as $canary$
begin
  if p_allowed_user_ids is null
    or pg_catalog.cardinality(p_allowed_user_ids) not between 1 and 5
    or (select pg_catalog.count(*) from pg_catalog.unnest(p_allowed_user_ids) a(id)
        where a.id is null) > 0
    or (select pg_catalog.count(distinct a.id) from pg_catalog.unnest(p_allowed_user_ids) a(id))
       <> pg_catalog.cardinality(p_allowed_user_ids)
  then
    return;
  end if;

  return query
  with claimed as (
    select j.id
    from private.push_delivery_jobs j
    where exists(select 1 from private.push_v4_runtime_settings
                 where singleton and generation_enabled and delivery_enabled)
      and (j.status in ('pending','retry') and j.next_attempt_at<=pg_catalog.now()
           or j.status='processing' and j.lease_until<pg_catalog.now())
      and j.attempt_count < 10
      and exists (select 1 from private.push_subscriptions s
                  where s.id=j.subscription_id and s.revoked_at is null
                    and s.user_id = any(p_allowed_user_ids)
                    and exists (select 1 from public.user_notifications n
                                where n.id=j.notification_id and n.recipient_id=s.user_id))
    order by j.next_attempt_at,j.created_at
    for update of j skip locked
    limit least(greatest(coalesce(p_limit,1),1),15)
  ), changed as (
    update private.push_delivery_jobs j
    set status='processing',attempt_count=j.attempt_count+1,
        lease_until=pg_catalog.now()+interval '90 seconds',
        updated_at=pg_catalog.now()
    from claimed c where c.id=j.id
    returning j.id,j.notification_id,j.subscription_id,j.attempt_count
  )
  select c.id, n.kind, n.resource_id, s.endpoint,
         s.p256dh,s.auth_secret,c.attempt_count
  from changed c
  join public.user_notifications n on n.id=c.notification_id
  join private.push_subscriptions s on s.id=c.subscription_id
  where s.revoked_at is null
    and s.user_id = any(p_allowed_user_ids)
    and n.recipient_id = s.user_id;
end;
$canary$;


revoke all on function public.push_v4_expand_canary_outbox(integer,uuid[])
  from public, anon, authenticated;
revoke all on function public.push_v4_claim_canary_jobs(integer,uuid[])
  from public, anon, authenticated;
grant execute on function public.push_v4_expand_canary_outbox(integer,uuid[]) to service_role;
grant execute on function public.push_v4_claim_canary_jobs(integer,uuid[]) to service_role;

-- Safe rollout: no runtime worker may invoke the unrestricted variants.
revoke execute on function public.push_v4_expand_outbox(integer) from service_role;
revoke execute on function public.push_v4_claim_jobs(integer) from service_role;
