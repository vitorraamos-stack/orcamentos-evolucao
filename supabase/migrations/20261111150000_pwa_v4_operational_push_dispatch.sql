-- PWA V4 2E: fatos canônicos + fila transacional + funções de despacho.
-- PREPARADO, NÃO APLICAR SEM AUTORIZAÇÃO.
-- Depende das migrations 20261111105940 (tabelas) e 20261111120000 (RPCs inscrição).
-- Nenhum cron, HTTP, segredo, permissão de usuário ou envio é criado por este SQL.
-- Duas flags internas começam FALSE e NÃO são alteráveis pelo navegador nem pelo service_role.

create table if not exists private.push_v4_runtime_settings (
  singleton boolean primary key default true check (singleton),
  generation_enabled boolean not null default false,
  delivery_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table private.push_v4_runtime_settings enable row level security;
revoke all on private.push_v4_runtime_settings from public, anon, authenticated, service_role;
grant select on private.push_v4_runtime_settings to service_role;
insert into private.push_v4_runtime_settings(singleton, generation_enabled, delivery_enabled)
values (true, false, false)
on conflict (singleton) do nothing;

alter table private.notification_source_outbox
  add column if not exists required_module text
    check (required_module in ('hub_os','hub_os_arte','hub_os_producao','hub_os_instalacoes'));

-- Nenhuma mudança no caminho crítico de OS quando geração está desligada.
-- Trigger proprietário roda com privilégios próprios; search_path fixo,
-- sem SQL dinâmico, sem contato externo. Nunca usar os_orders_event do cliente.
create or replace function private.push_v4_capture_operational_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_kind text := null;
  v_scope text;
  v_module text := null;
  v_order_id uuid;
  v_object_id uuid;
  v_hint uuid := null;
  v_key text;
begin
  if not exists (
    select 1 from private.push_v4_runtime_settings
    where singleton and generation_enabled
  ) then
    return new;
  end if;

  if TG_TABLE_NAME = 'os_orders' then
    v_order_id := new.id;
    v_object_id := new.id;
    if coalesce(new.archived,false) then return new; end if;
    if TG_OP = 'INSERT' and new.art_status = 'Caixa de Entrada' then
      v_kind := 'art_inbox';
      v_module := 'hub_os_arte';
    elsif TG_OP = 'UPDATE' and new.art_status is distinct from old.art_status then
      if new.art_status = 'Caixa de Entrada' then
        v_kind := 'art_inbox';
        v_module := 'hub_os_arte';
      elsif new.art_status = 'Produzir' then
        v_kind := 'production_released';
        v_module := 'hub_os_producao';
      end if;
    end if;
  elsif TG_TABLE_NAME = 'os_order_assignees' then
    if TG_OP <> 'INSERT' and
       new.user_id is not distinct from old.user_id and
       new.scope is not distinct from old.scope then return new; end if;
    v_order_id := new.order_id;
    v_object_id := new.id;
    v_hint := new.user_id;
    v_scope := upper(new.scope);
    v_module := case
      when v_scope = 'ART' then 'hub_os_arte'
      when v_scope in ('PRODUCTION','FINISHING') then 'hub_os_producao'
      when v_scope = 'INSTALLATION' then 'hub_os_instalacoes'
      when v_scope = 'GENERAL' then 'hub_os'
      else null
    end;
    if v_module is not null then v_kind := 'assignment'; end if;
  elsif TG_TABLE_NAME = 'os_installations' then
    v_order_id := new.os_id;
    v_object_id := new.id;
    v_module := 'hub_os_instalacoes';
    if new.status <> 'SCHEDULED' then return new; end if;
    if TG_OP = 'INSERT' then
      v_kind := 'installation_scheduled';
    elsif TG_OP = 'UPDATE' then
      if old.status is distinct from new.status and new.status='SCHEDULED' then
        v_kind := 'installation_scheduled';
      elsif new.scheduled_start is distinct from old.scheduled_start
         or new.scheduled_end is distinct from old.scheduled_end
         or new.team_id is distinct from old.team_id
         or new.responsible_id is distinct from old.responsible_id then
        v_kind := 'installation_rescheduled';
      end if;
    end if;
  end if;

  if v_kind is null or v_order_id is null or v_module is null then return new; end if;
  if exists(select 1 from public.os_orders o where o.id=v_order_id and o.archived=false) then
    -- One canonical event per kind/resource per committed transaction;
    -- no replay on retries or duplicate status updates.
    v_key := v_kind || ':' || TG_TABLE_NAME || ':' || v_object_id::text ||
      ':' || pg_catalog.txid_current()::text;
    insert into private.notification_source_outbox
      (source_key,event_kind,source_table,source_object_id,order_id,
       recipient_hint_id,required_module)
    values (v_key,v_kind,TG_TABLE_NAME,v_object_id,v_order_id,
      v_hint,v_module)
    on conflict(source_key) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.push_v4_capture_operational_change()
  from public, anon, authenticated, service_role;

create trigger push_v4_os_order_events
  after insert or update of art_status on public.os_orders
  for each row execute function private.push_v4_capture_operational_change();
create trigger push_v4_order_assigned
  after insert or update of user_id, scope on public.os_order_assignees
  for each row execute function private.push_v4_capture_operational_change();
create trigger push_v4_installation_events
  after insert or update of status, scheduled_start, scheduled_end, team_id, responsible_id
  on public.os_installations
  for each row execute function private.push_v4_capture_operational_change();

-- Capta destinatários SOMENTE de tabelas canônicas. Não aceita IDs da API.
-- RLS do histórico ainda valida o módulo vigente e bloqueia OS arquivada.
-- A função roda como service_role (SECURITY INVOKER + EXECUTE restrito).
create or replace function public.push_v4_expand_outbox(p_limit integer default 20)
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

-- Second authorization guard immediately before HTTP dispatch. Losing a
-- module, assignment, team membership or archiving an OS denies delivery.
create or replace function public.push_v4_job_eligible(p_job_id uuid, p_attempt_number integer)
returns boolean
language sql stable security invoker set search_path=''
as $$
  select exists (
    select 1
    from private.push_delivery_jobs j
    join public.user_notifications n on n.id=j.notification_id
    join private.notification_source_outbox e on e.id=n.source_event_id
    join private.push_subscriptions s on s.id=j.subscription_id
    join public.os_orders o on o.id=n.resource_id
    where j.id=p_job_id
      and j.attempt_count=p_attempt_number
      and j.status='processing'
      and j.lease_until > pg_catalog.now()
      and j.attempt_count <= 10
      and n.recipient_id=s.user_id
      and n.kind=e.event_kind
      and n.required_module=e.required_module
      and n.resource_id=e.order_id
      and n.expires_at > pg_catalog.now()
      and o.archived=false
      and s.revoked_at is null
      and s.last_seen_at >= pg_catalog.now()-interval '90 days'
      and public.has_module_access(s.user_id,'hub_os')
      and public.has_module_access(s.user_id,n.required_module)
      and exists (select 1 from private.push_v4_runtime_settings
                  where singleton and generation_enabled and delivery_enabled)
      and (
        (n.kind='assignment' and exists (
          select 1 from public.os_order_assignees a
          where a.order_id=n.resource_id
            and a.id=e.source_object_id and a.user_id=s.user_id
            and (case
              when upper(a.scope)='ART' then 'hub_os_arte'
              when upper(a.scope) in ('PRODUCTION','FINISHING') then 'hub_os_producao'
              when upper(a.scope)='INSTALLATION' then 'hub_os_instalacoes'
              when upper(a.scope)='GENERAL' then 'hub_os'
              else null
            end)=n.required_module
        ))
        or (n.kind='art_inbox' and o.art_status='Caixa de Entrada')
        or (n.kind='production_released' and o.art_status='Produzir')
        or (n.kind in ('installation_scheduled','installation_rescheduled')
          and exists (
            select 1 from public.os_installations i
            where i.id=e.source_object_id and i.os_id=n.resource_id
              and i.status='SCHEDULED'
              and (i.responsible_id=s.user_id
               or exists(select 1 from public.os_installation_team_members m
                         where m.team_id=i.team_id and m.user_id=s.user_id))
          ))
      )
  );
$$;

-- Claim up to 15 jobs atomically. Two concurrent cron requests never own
-- the same lease. Idempotent rows prevent duplicate queue materialization.
create or replace function public.push_v4_claim_jobs(p_limit integer default 10)
returns table (
  job_id uuid, kind text, order_id uuid, endpoint text,
  p256dh text, auth_secret text, attempt_number integer
)
language sql security invoker set search_path=''
as $$
  with claimed as (
    select j.id
    from private.push_delivery_jobs j
    where exists(select 1 from private.push_v4_runtime_settings
                 where singleton and generation_enabled and delivery_enabled)
      and (j.status in ('pending','retry') and j.next_attempt_at<=pg_catalog.now()
           or j.status='processing' and j.lease_until<pg_catalog.now())
      and j.attempt_count < 10
      and exists (select 1 from private.push_subscriptions s
                  where s.id=j.subscription_id and s.revoked_at is null)
    order by j.next_attempt_at,j.created_at
    for update skip locked
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
$$;

create or replace function public.push_v4_finish_job(
  p_job_id uuid,
  p_expected_attempt integer,
  p_outcome text,
  p_http_status integer default null
)
returns boolean
language plpgsql security invoker set search_path=''
as $$
declare
  v_subscription uuid;
begin
  if p_job_id is null or p_expected_attempt is null or
     p_expected_attempt not between 1 and 10 or
     p_outcome is null or p_outcome not in ('sent','retry','discarded')
    or (p_http_status is not null and (p_http_status < 100 or p_http_status > 599))
  then return false; end if;

  select subscription_id into v_subscription
  from private.push_delivery_jobs
  where id=p_job_id and status='processing'
    and attempt_count=p_expected_attempt
    and lease_until > pg_catalog.now()
  for update;
  if not found then return false; end if;

  update private.push_delivery_jobs j
  set status=case
      when p_outcome='sent' then 'sent'
      when p_outcome='discarded' or j.attempt_count>=10 then 'discarded'
      else 'retry' end,
      last_http_status=p_http_status,
      last_error_code=case
        when p_outcome='sent' then null
        when p_outcome='discarded' then 'invalid_or_ineligible'
        else 'temporary_failure' end,
      lease_until=null,
      next_attempt_at=case when p_outcome='retry' then
        pg_catalog.now()+ pg_catalog.make_interval(
          secs=>least(7200,30*pg_catalog.power(2,j.attempt_count)::integer))
        else j.next_attempt_at end,
      updated_at=pg_catalog.now()
  where j.id=p_job_id and j.attempt_count=p_expected_attempt;

  if p_outcome='sent' then
    update private.push_subscriptions set failure_count=0,last_success_at=pg_catalog.now()
    where id=v_subscription;
  elsif p_http_status in (404,410) then
    update private.push_subscriptions set revoked_at=pg_catalog.now()
    where id=v_subscription and revoked_at is null;
  elsif p_outcome='retry' then
    update private.push_subscriptions
    set failure_count=least(failure_count+1,100)
    where id=v_subscription and revoked_at is null;
  end if;
  return true;
end;
$$;

-- Privileged server APIs only; never callable by end-user JWTs or anon.
revoke all on function public.push_v4_expand_outbox(integer)
from public, anon, authenticated;
revoke all on function public.push_v4_job_eligible(uuid,integer)
from public, anon, authenticated;
revoke all on function public.push_v4_claim_jobs(integer)
from public, anon, authenticated;
revoke all on function public.push_v4_finish_job(uuid,integer,text,integer)
from public, anon, authenticated;

grant execute on function public.push_v4_expand_outbox(integer) to service_role;
grant execute on function public.push_v4_job_eligible(uuid,integer) to service_role;
grant execute on function public.push_v4_claim_jobs(integer) to service_role;
grant execute on function public.push_v4_finish_job(uuid,integer,text,integer) to service_role;


-- Read-only, privileged go-live preflight. It returns counts and boolean
-- switches only; no client identifiers, endpoint URLs, VAPID keys or secrets.
create or replace function public.push_v4_release_readiness()
returns jsonb
language sql stable security invoker set search_path=''
as $$
  select pg_catalog.jsonb_build_object(
    'generationEnabled',coalesce((select generation_enabled
       from private.push_v4_runtime_settings where singleton),false),
    'deliveryEnabled',coalesce((select delivery_enabled
       from private.push_v4_runtime_settings where singleton),false),
    'registrationRpcPresent',pg_catalog.to_regprocedure(
       'public.push_v4_register_subscription(uuid,text,text,text,text)') is not null,
    'subscriptionsActive',(select count(*) from private.push_subscriptions
       where revoked_at is null),
    'pendingEvents',(select count(*) from private.notification_source_outbox
       where state in ('pending','processing','failed')),
    'pendingJobs',(select count(*) from private.push_delivery_jobs
       where status in ('pending','processing','retry'))
  )
$$;
revoke all on function public.push_v4_release_readiness()
  from public, anon, authenticated;
grant execute on function public.push_v4_release_readiness() to service_role;

-- Deliberately no activation step in the database migration.
-- DBA-only: flags in private.push_v4_runtime_settings BOTH remain false.
