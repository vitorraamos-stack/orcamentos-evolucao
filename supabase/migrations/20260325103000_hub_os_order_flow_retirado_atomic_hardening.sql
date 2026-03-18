
create or replace function public.order_flow_list_secure()
returns setof public.hub_os_order_flow_state
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_actor_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Usuário não autenticado.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_AUTH_REQUIRED';
  end if;

  if not public.has_module_access(v_actor_id, 'hub_os') then
    raise exception 'Você não tem permissão para visualizar o fluxo global de OS.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_FORBIDDEN';
  end if;

  return query
  select *
  from public.hub_os_order_flow_state
  order by updated_at desc;
end;
$$;

create or replace function public.order_flow_set_avisado_secure(
  p_order_key text,
  p_source_type text,
  p_source_id uuid,
  p_avisado boolean
)
returns public.hub_os_order_flow_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_result public.hub_os_order_flow_state;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Usuário não autenticado.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_AUTH_REQUIRED';
  end if;

  if not public.has_module_access(v_actor_id, 'hub_os') then
    raise exception 'Você não tem permissão para alterar o fluxo global de OS.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_FORBIDDEN';
  end if;

  if p_source_type not in ('os', 'os_orders') then
    raise exception 'Fonte inválida para fluxo global.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_INVALID_SOURCE';
  end if;

  if coalesce(trim(p_order_key), '') = '' then
    raise exception 'Chave da OS é obrigatória.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_KEY_REQUIRED';
  end if;

  insert into public.hub_os_order_flow_state (
    order_key,
    source_type,
    source_id,
    avisado_at,
    avisado_by,
    retirado_at,
    retirado_by
  ) values (
    p_order_key,
    p_source_type,
    p_source_id,
    case when p_avisado then now() else null end,
    case when p_avisado then v_actor_id else null end,
    null,
    null
  )
  on conflict (order_key)
  do update set
    source_type = excluded.source_type,
    source_id = excluded.source_id,
    avisado_at = case when p_avisado then now() else null end,
    avisado_by = case when p_avisado then v_actor_id else null end,
    retirado_at = case when p_avisado then null else public.hub_os_order_flow_state.retirado_at end,
    retirado_by = case when p_avisado then null else public.hub_os_order_flow_state.retirado_by end
  returning * into v_result;

  return v_result;
end;
$$;

create or replace function public.order_flow_mark_retirado_secure(
  p_order_key text,
  p_source_type text,
  p_source_id uuid
)
returns public.hub_os_order_flow_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_result public.hub_os_order_flow_state;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Usuário não autenticado.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_AUTH_REQUIRED';
  end if;

  if not public.has_module_access(v_actor_id, 'hub_os') then
    raise exception 'Você não tem permissão para alterar o fluxo global de OS.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_FORBIDDEN';
  end if;

  if p_source_type not in ('os', 'os_orders') then
    raise exception 'Fonte inválida para fluxo global.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_INVALID_SOURCE';
  end if;

  if coalesce(trim(p_order_key), '') = '' then
    raise exception 'Chave da OS é obrigatória.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_KEY_REQUIRED';
  end if;

  insert into public.hub_os_order_flow_state (
    order_key,
    source_type,
    source_id,
    avisado_at,
    avisado_by,
    retirado_at,
    retirado_by
  ) values (
    p_order_key,
    p_source_type,
    p_source_id,
    null,
    null,
    now(),
    v_actor_id
  )
  on conflict (order_key)
  do update set
    source_type = excluded.source_type,
    source_id = excluded.source_id,
    avisado_at = null,
    avisado_by = null,
    retirado_at = coalesce(public.hub_os_order_flow_state.retirado_at, now()),
    retirado_by = coalesce(public.hub_os_order_flow_state.retirado_by, v_actor_id)
  returning * into v_result;

  return v_result;
end;
$$;

create or replace function public.order_flow_mark_retirado_and_finalize_secure(
  p_order_key text,
  p_source_type text,
  p_source_id uuid,
  p_actor_name text default null
)
returns table (
  order_key text,
  source_type text,
  source_id uuid,
  avisado_at timestamptz,
  avisado_by uuid,
  retirado_at timestamptz,
  retirado_by uuid,
  updated_at timestamptz,
  order_prod_status text,
  order_updated_at timestamptz,
  already_retirado boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_existing public.hub_os_order_flow_state;
  v_flow_row public.hub_os_order_flow_state;
  v_prev_prod_status text;
  v_order_updated_at timestamptz;
  v_order_prod_status text;
  v_already_retirado boolean := false;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Usuário não autenticado.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_AUTH_REQUIRED';
  end if;

  if not public.has_module_access(v_actor_id, 'hub_os') then
    raise exception 'Você não tem permissão para marcar retirada.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_FORBIDDEN';
  end if;

  if p_source_type <> 'os_orders' then
    raise exception 'Fonte inválida para retirada atômica.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_FINALIZE_INVALID_SOURCE';
  end if;

  if coalesce(trim(p_order_key), '') = '' then
    raise exception 'Chave da OS é obrigatória.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_KEY_REQUIRED';
  end if;

  select *
    into v_existing
  from public.hub_os_order_flow_state
  where hub_os_order_flow_state.order_key = p_order_key
  for update;

  v_already_retirado := v_existing.retirado_at is not null;

  insert into public.hub_os_order_flow_state (
    order_key,
    source_type,
    source_id,
    avisado_at,
    avisado_by,
    retirado_at,
    retirado_by
  ) values (
    p_order_key,
    p_source_type,
    p_source_id,
    null,
    null,
    now(),
    v_actor_id
  )
  on conflict (order_key)
  do update set
    source_type = excluded.source_type,
    source_id = excluded.source_id,
    avisado_at = null,
    avisado_by = null,
    retirado_at = coalesce(public.hub_os_order_flow_state.retirado_at, now()),
    retirado_by = coalesce(public.hub_os_order_flow_state.retirado_by, v_actor_id)
  returning * into v_flow_row;

  select o.prod_status
    into v_prev_prod_status
  from public.os_orders o
  where o.id = p_source_id;

  update public.os_orders
     set prod_status = 'Finalizados',
         updated_at = now(),
         updated_by = v_actor_id
   where id = p_source_id
     and archived = false
  returning os_orders.prod_status, os_orders.updated_at
    into v_order_prod_status, v_order_updated_at;

  if not found then
    raise exception 'OS não encontrada para finalizar retirada.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_ORDER_NOT_FOUND';
  end if;

  if not v_already_retirado then
    insert into public.os_orders_event (os_id, type, payload, created_by, created_at)
    values (
      p_source_id,
      'status_change',
      jsonb_build_object(
        'board', 'producao',
        'from', v_prev_prod_status,
        'to', 'Finalizados',
        'actor_name', p_actor_name
      ),
      v_actor_id,
      now()
    );

    insert into public.os_orders_event (os_id, type, payload, created_by, created_at)
    values (
      p_source_id,
      'avisado_toggle',
      jsonb_build_object(
        'avisado', false,
        'actor_name', p_actor_name
      ),
      v_actor_id,
      now()
    );
  end if;

  return query
  select
    v_flow_row.order_key,
    v_flow_row.source_type,
    v_flow_row.source_id,
    v_flow_row.avisado_at,
    v_flow_row.avisado_by,
    v_flow_row.retirado_at,
    v_flow_row.retirado_by,
    v_flow_row.updated_at,
    v_order_prod_status,
    v_order_updated_at,
    v_already_retirado;
end;
$$;

drop policy if exists "hub_os_order_flow_state_select_authenticated" on public.hub_os_order_flow_state;
create policy "hub_os_order_flow_state_select_authenticated"
  on public.hub_os_order_flow_state
  for select
  to authenticated
  using (public.has_module_access(auth.uid(), 'hub_os'));

drop policy if exists "hub_os_order_flow_state_insert_authenticated" on public.hub_os_order_flow_state;
create policy "hub_os_order_flow_state_insert_authenticated"
  on public.hub_os_order_flow_state
  for insert
  to authenticated
  with check (public.has_module_access(auth.uid(), 'hub_os'));

drop policy if exists "hub_os_order_flow_state_update_authenticated" on public.hub_os_order_flow_state;
create policy "hub_os_order_flow_state_update_authenticated"
  on public.hub_os_order_flow_state
  for update
  to authenticated
  using (public.has_module_access(auth.uid(), 'hub_os'))
  with check (public.has_module_access(auth.uid(), 'hub_os'));

revoke all on function public.order_flow_mark_retirado_and_finalize_secure(text, text, uuid, text) from public;
grant execute on function public.order_flow_mark_retirado_and_finalize_secure(text, text, uuid, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'os_kiosk_board'
    ) then
      alter publication supabase_realtime add table public.os_kiosk_board;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'os_order_asset_jobs'
    ) then
      alter publication supabase_realtime add table public.os_order_asset_jobs;
    end if;
  end if;
end;
$$;
