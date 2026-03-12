create table if not exists public.os_kiosk_board (
  id uuid primary key default gen_random_uuid(),
  order_key text not null unique,
  source_type text not null check (source_type in ('os', 'os_orders')),
  source_id uuid not null,
  os_number bigint null,
  sale_number text null,
  client_name text null,
  title text null,
  description text null,
  address text null,
  delivery_date date null,
  delivery_mode text null,
  production_tag text null,
  upstream_status text null,
  current_stage text not null check (
    current_stage in (
      'acabamento_entrega_retirada',
      'acabamento_instalacao',
      'embalagem',
      'instalacoes',
      'pronto_avisar',
      'logistica'
    )
  ),
  material_ready boolean not null default false,
  terminal_id text null,
  last_lookup_code text null,
  created_by uuid null references auth.users(id),
  updated_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create index if not exists os_kiosk_board_current_stage_idx
  on public.os_kiosk_board (current_stage);

create index if not exists os_kiosk_board_updated_at_desc_idx
  on public.os_kiosk_board (updated_at desc);

create or replace function public.os_kiosk_board_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists os_kiosk_board_touch_updated_at_trg on public.os_kiosk_board;
create trigger os_kiosk_board_touch_updated_at_trg
before update on public.os_kiosk_board
for each row
execute function public.os_kiosk_board_touch_updated_at();

alter table public.os_kiosk_board enable row level security;

drop policy if exists "os_kiosk_board_select_authenticated" on public.os_kiosk_board;
create policy "os_kiosk_board_select_authenticated"
  on public.os_kiosk_board
  for select
  to authenticated
  using (true);

drop policy if exists "os_kiosk_board_insert_authenticated" on public.os_kiosk_board;
create policy "os_kiosk_board_insert_authenticated"
  on public.os_kiosk_board
  for insert
  to authenticated
  with check (true);

drop policy if exists "os_kiosk_board_update_authenticated" on public.os_kiosk_board;
create policy "os_kiosk_board_update_authenticated"
  on public.os_kiosk_board
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "os_kiosk_board_delete_authenticated" on public.os_kiosk_board;
create policy "os_kiosk_board_delete_authenticated"
  on public.os_kiosk_board
  for delete
  to authenticated
  using (true);

create or replace function public.kiosk_board_list()
returns setof public.os_kiosk_board
language sql
stable
as $$
  select *
  from public.os_kiosk_board
  order by updated_at desc;
$$;

create or replace function public.kiosk_board_register(
  p_source_type text,
  p_source_id uuid,
  p_lookup_code text default null,
  p_actor_id uuid default null,
  p_terminal_id text default null
)
returns public.os_kiosk_board
language plpgsql
as $$
declare
  v_order_key text;
  v_card public.os_kiosk_board;
  v_delivery_mode text;
  v_upstream_status text;
  v_stage text;
begin
  if p_source_type not in ('os', 'os_orders') then
    raise exception 'Fonte inválida para o quiosque.'
      using errcode = 'P0001', detail = 'KIOSK_INVALID_SOURCE';
  end if;

  v_order_key := case
    when p_source_type = 'os' then 'os:' || p_source_id::text
    else 'os_orders:' || p_source_id::text
  end;

  if p_source_type = 'os' then
    select
      o.os_number,
      o.sale_number,
      coalesce(nullif(o.client_name, ''), o.customer_name),
      o.title,
      coalesce(o.description, o.notes),
      o.address,
      o.delivery_date,
      o.delivery_type,
      o.status_producao,
      case when lower(coalesce(o.status_producao, '')) like '%finaliz%' then true else false end
    into
      v_card.os_number,
      v_card.sale_number,
      v_card.client_name,
      v_card.title,
      v_card.description,
      v_card.address,
      v_card.delivery_date,
      v_delivery_mode,
      v_upstream_status,
      v_card.material_ready
    from public.os o
    where o.id = p_source_id;

    if not found then
      raise exception 'OS de origem não encontrada.'
        using errcode = 'P0001', detail = 'KIOSK_UPSTREAM_NOT_FOUND';
    end if;
  else
    select
      o.os_number,
      o.sale_number,
      o.client_name,
      o.title,
      o.description,
      o.address,
      o.delivery_date,
      o.logistic_type,
      o.production_tag,
      o.prod_status,
      case when lower(coalesce(o.prod_status, '')) like '%finaliz%' then true else false end
    into
      v_card.os_number,
      v_card.sale_number,
      v_card.client_name,
      v_card.title,
      v_card.description,
      v_card.address,
      v_card.delivery_date,
      v_delivery_mode,
      v_card.production_tag,
      v_upstream_status,
      v_card.material_ready
    from public.os_orders o
    where o.id = p_source_id;

    if not found then
      raise exception 'OS de origem não encontrada.'
        using errcode = 'P0001', detail = 'KIOSK_UPSTREAM_NOT_FOUND';
    end if;
  end if;

  if v_card.material_ready then
    raise exception 'OS já está finalizada e não pode entrar no quiosque.'
      using errcode = 'P0001', detail = 'KIOSK_UPSTREAM_FINALIZED';
  end if;

  v_stage := case
    when upper(coalesce(v_delivery_mode, '')) in ('INSTALACAO', 'INSTALAÇÃO') then 'acabamento_instalacao'
    else 'acabamento_entrega_retirada'
  end;

  insert into public.os_kiosk_board (
    order_key,
    source_type,
    source_id,
    os_number,
    sale_number,
    client_name,
    title,
    description,
    address,
    delivery_date,
    delivery_mode,
    production_tag,
    upstream_status,
    current_stage,
    material_ready,
    terminal_id,
    last_lookup_code,
    created_by,
    updated_by
  ) values (
    v_order_key,
    p_source_type,
    p_source_id,
    v_card.os_number,
    v_card.sale_number,
    v_card.client_name,
    v_card.title,
    v_card.description,
    v_card.address,
    v_card.delivery_date,
    v_delivery_mode,
    v_card.production_tag,
    v_upstream_status,
    v_stage,
    false,
    p_terminal_id,
    p_lookup_code,
    p_actor_id,
    p_actor_id
  )
  returning * into v_card;

  return v_card;

exception
  when unique_violation then
    raise exception 'Essa OS já está no quiosque.'
      using errcode = 'P0001', detail = 'KIOSK_DUPLICATE';
end;
$$;

create or replace function public.kiosk_board_move(
  p_order_key text,
  p_action text,
  p_actor_id uuid default null,
  p_terminal_id text default null
)
returns table (
  id uuid,
  order_key text,
  source_type text,
  source_id uuid,
  os_number bigint,
  sale_number text,
  client_name text,
  title text,
  description text,
  address text,
  delivery_date date,
  delivery_mode text,
  production_tag text,
  upstream_status text,
  current_stage text,
  material_ready boolean,
  terminal_id text,
  last_lookup_code text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  removed boolean,
  result_code text,
  result_message text
)
language plpgsql
as $$
declare
  v_card public.os_kiosk_board;
  v_next_stage text;
  v_next_status text;
  v_next_tag text;
  v_is_finalized boolean;
  v_previous_upstream_status text;
begin
  select * into v_card
  from public.os_kiosk_board
  where os_kiosk_board.order_key = p_order_key
  for update;

  if not found then
    raise exception 'Card do quiosque não encontrado.'
      using errcode = 'P0001', detail = 'KIOSK_CARD_NOT_FOUND';
  end if;

  if p_action = 'to_packaging' then
    v_next_stage := 'embalagem';
  elsif p_action = 'to_installations' then
    v_next_stage := 'instalacoes';
    v_next_status := 'Instalação Agendada';
    if v_card.source_type = 'os_orders' then
      v_next_tag := 'PRONTO';
    end if;
  elsif p_action = 'to_ready_notify' then
    v_next_stage := 'pronto_avisar';
    v_next_status := case when v_card.source_type = 'os' then 'PRONTO/AVISAR' else 'Pronto / Avisar Cliente' end;
  elsif p_action = 'to_logistics' then
    v_next_stage := 'logistica';
    v_next_status := case when v_card.source_type = 'os' then 'Logística' else 'Logística (Entrega/Transportadora)' end;
  elsif p_action = 'remove_if_finalized' then
    if v_card.source_type = 'os' then
      select lower(coalesce(o.status_producao, '')) like '%finaliz%'
      into v_is_finalized
      from public.os o
      where o.id = v_card.source_id;
    else
      select lower(coalesce(o.prod_status, '')) like '%finaliz%'
      into v_is_finalized
      from public.os_orders o
      where o.id = v_card.source_id;
    end if;

    if v_is_finalized is null then
      raise exception 'Entidade upstream não encontrada para remoção.'
        using errcode = 'P0001', detail = 'KIOSK_UPSTREAM_NOT_FOUND';
    end if;

    if not v_is_finalized then
      raise exception 'A OS ainda não está finalizada.'
        using errcode = 'P0001', detail = 'KIOSK_NOT_FINALIZED';
    end if;

    delete from public.os_kiosk_board where public.os_kiosk_board.order_key = p_order_key;

    return query
    select
      v_card.id, v_card.order_key, v_card.source_type, v_card.source_id,
      v_card.os_number, v_card.sale_number, v_card.client_name, v_card.title,
      v_card.description, v_card.address, v_card.delivery_date, v_card.delivery_mode,
      v_card.production_tag, v_card.upstream_status, v_card.current_stage,
      v_card.material_ready, v_card.terminal_id, v_card.last_lookup_code,
      v_card.created_by, v_card.updated_by, v_card.created_at, v_card.updated_at,
      true, 'removed_finalized', 'OS removida do quiosque por finalização';
    return;
  else
    raise exception 'Ação inválida para o quiosque.'
      using errcode = 'P0001', detail = 'KIOSK_INVALID_ACTION';
  end if;

  if v_card.source_type = 'os' then
    v_previous_upstream_status := v_card.upstream_status;

    update public.os
      set status_producao = coalesce(v_next_status, status_producao),
          updated_at = now()
      where id = v_card.source_id
      returning
        os_number,
        sale_number,
        coalesce(nullif(client_name, ''), customer_name),
        title,
        coalesce(description, notes),
        address,
        delivery_date,
        delivery_type,
        status_producao
      into
        v_card.os_number,
        v_card.sale_number,
        v_card.client_name,
        v_card.title,
        v_card.description,
        v_card.address,
        v_card.delivery_date,
        v_card.delivery_mode,
        v_card.upstream_status;

    if not found then
      raise exception 'Entidade upstream não encontrada para movimentação.'
        using errcode = 'P0001', detail = 'KIOSK_UPSTREAM_NOT_FOUND';
    end if;

    if v_next_status is not null then
      insert into public.os_event (os_id, type, payload, created_by, created_at)
      values (
        v_card.source_id,
        'status_producao_changed',
        jsonb_build_object(
          'from', v_previous_upstream_status,
          'to', v_next_status,
          'source', 'kiosk',
          'action', p_action,
          'terminal_id', p_terminal_id
        ),
        p_actor_id,
        now()
      );
    end if;
  else
    v_previous_upstream_status := v_card.upstream_status;

    update public.os_orders
      set prod_status = coalesce(v_next_status, prod_status),
          production_tag = coalesce(v_next_tag, production_tag),
          updated_at = now(),
          updated_by = coalesce(p_actor_id, updated_by)
      where id = v_card.source_id
      returning
        os_number,
        sale_number,
        client_name,
        title,
        description,
        address,
        delivery_date,
        logistic_type,
        production_tag,
        prod_status
      into
        v_card.os_number,
        v_card.sale_number,
        v_card.client_name,
        v_card.title,
        v_card.description,
        v_card.address,
        v_card.delivery_date,
        v_card.delivery_mode,
        v_card.production_tag,
        v_card.upstream_status;

    if not found then
      raise exception 'Entidade upstream não encontrada para movimentação.'
        using errcode = 'P0001', detail = 'KIOSK_UPSTREAM_NOT_FOUND';
    end if;

    if v_next_status is not null then
      insert into public.os_orders_event (os_id, type, payload, created_by, created_at)
      values (
        v_card.source_id,
        'prod_status_changed',
        jsonb_build_object(
          'from', v_previous_upstream_status,
          'to', v_next_status,
          'source', 'kiosk',
          'action', p_action,
          'terminal_id', p_terminal_id
        ),
        p_actor_id,
        now()
      );
    end if;
  end if;

  update public.os_kiosk_board
    set current_stage = v_next_stage,
        material_ready = case
          when p_action in ('to_installations', 'to_ready_notify') then true
          else material_ready
        end,
        terminal_id = coalesce(p_terminal_id, terminal_id),
        updated_by = coalesce(p_actor_id, updated_by),
        os_number = v_card.os_number,
        sale_number = v_card.sale_number,
        client_name = v_card.client_name,
        title = v_card.title,
        description = v_card.description,
        address = v_card.address,
        delivery_date = v_card.delivery_date,
        delivery_mode = v_card.delivery_mode,
        production_tag = v_card.production_tag,
        upstream_status = coalesce(v_next_status, v_card.upstream_status)
    where public.os_kiosk_board.order_key = p_order_key
    returning * into v_card;

  return query
  select
    v_card.id,
    v_card.order_key,
    v_card.source_type,
    v_card.source_id,
    v_card.os_number,
    v_card.sale_number,
    v_card.client_name,
    v_card.title,
    v_card.description,
    v_card.address,
    v_card.delivery_date,
    v_card.delivery_mode,
    v_card.production_tag,
    v_card.upstream_status,
    v_card.current_stage,
    v_card.material_ready,
    v_card.terminal_id,
    v_card.last_lookup_code,
    v_card.created_by,
    v_card.updated_by,
    v_card.created_at,
    v_card.updated_at,
    false,
    'ok',
    'Movimentação concluída';
end;
$$;

create or replace function public.kiosk_board_refresh_snapshot(p_order_key text)
returns public.os_kiosk_board
language plpgsql
as $$
declare
  v_card public.os_kiosk_board;
begin
  select * into v_card
  from public.os_kiosk_board
  where order_key = p_order_key
  for update;

  if not found then
    raise exception 'Card do quiosque não encontrado.'
      using errcode = 'P0001', detail = 'KIOSK_CARD_NOT_FOUND';
  end if;

  if v_card.source_type = 'os' then
    update public.os_kiosk_board kb
      set
        os_number = o.os_number,
        sale_number = o.sale_number,
        client_name = coalesce(nullif(o.client_name, ''), o.customer_name),
        title = o.title,
        description = coalesce(o.description, o.notes),
        address = o.address,
        delivery_date = o.delivery_date,
        delivery_mode = o.delivery_type,
        upstream_status = o.status_producao
      from public.os o
      where kb.order_key = p_order_key
        and o.id = kb.source_id
      returning kb.* into v_card;
  else
    update public.os_kiosk_board kb
      set
        os_number = o.os_number,
        sale_number = o.sale_number,
        client_name = o.client_name,
        title = o.title,
        description = o.description,
        address = o.address,
        delivery_date = o.delivery_date,
        delivery_mode = o.logistic_type,
        production_tag = o.production_tag,
        upstream_status = o.prod_status
      from public.os_orders o
      where kb.order_key = p_order_key
        and o.id = kb.source_id
      returning kb.* into v_card;
  end if;

  if not found then
    raise exception 'Entidade upstream não encontrada para refresh.'
      using errcode = 'P0001', detail = 'KIOSK_UPSTREAM_NOT_FOUND';
  end if;

  return v_card;
end;
$$;
