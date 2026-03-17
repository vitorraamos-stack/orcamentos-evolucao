create table if not exists public.hub_os_order_flow_state (
  order_key text primary key,
  source_type text not null check (source_type in ('os', 'os_orders')),
  source_id uuid not null,
  avisado_at timestamptz null,
  avisado_by uuid null references auth.users(id),
  retirado_at timestamptz null,
  retirado_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hub_os_order_flow_state_retirado_at_idx
  on public.hub_os_order_flow_state (retirado_at);

create index if not exists hub_os_order_flow_state_updated_at_desc_idx
  on public.hub_os_order_flow_state (updated_at desc);

create or replace function public.hub_os_order_flow_state_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists hub_os_order_flow_state_touch_updated_at_trg on public.hub_os_order_flow_state;
create trigger hub_os_order_flow_state_touch_updated_at_trg
before update on public.hub_os_order_flow_state
for each row
execute function public.hub_os_order_flow_state_touch_updated_at();

alter table public.hub_os_order_flow_state enable row level security;

drop policy if exists "hub_os_order_flow_state_select_authenticated" on public.hub_os_order_flow_state;
create policy "hub_os_order_flow_state_select_authenticated"
  on public.hub_os_order_flow_state
  for select
  to authenticated
  using (true);

drop policy if exists "hub_os_order_flow_state_insert_authenticated" on public.hub_os_order_flow_state;
create policy "hub_os_order_flow_state_insert_authenticated"
  on public.hub_os_order_flow_state
  for insert
  to authenticated
  with check (true);

drop policy if exists "hub_os_order_flow_state_update_authenticated" on public.hub_os_order_flow_state;
create policy "hub_os_order_flow_state_update_authenticated"
  on public.hub_os_order_flow_state
  for update
  to authenticated
  using (true)
  with check (true);

create or replace function public.order_flow_list_secure()
returns setof public.hub_os_order_flow_state
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.hub_os_order_flow_state
  order by updated_at desc;
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

revoke all on function public.order_flow_list_secure() from public;
revoke all on function public.order_flow_set_avisado_secure(text, text, uuid, boolean) from public;
revoke all on function public.order_flow_mark_retirado_secure(text, text, uuid) from public;

grant execute on function public.order_flow_list_secure() to authenticated;
grant execute on function public.order_flow_set_avisado_secure(text, text, uuid, boolean) to authenticated;
grant execute on function public.order_flow_mark_retirado_secure(text, text, uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'hub_os_order_flow_state'
    ) then
      alter publication supabase_realtime add table public.hub_os_order_flow_state;
    end if;
  end if;
end;
$$;
