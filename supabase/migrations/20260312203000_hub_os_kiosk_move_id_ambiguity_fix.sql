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
  from public.os_kiosk_board kb
  where kb.order_key = p_order_key
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
      select lower(coalesce(oo.prod_status, '')) like '%finaliz%'
      into v_is_finalized
      from public.os_orders oo
      where oo.id = v_card.source_id;
    end if;

    if v_is_finalized is null then
      raise exception 'Entidade upstream não encontrada para remoção.'
        using errcode = 'P0001', detail = 'KIOSK_UPSTREAM_NOT_FOUND';
    end if;

    if not v_is_finalized then
      raise exception 'A OS ainda não está finalizada.'
        using errcode = 'P0001', detail = 'KIOSK_NOT_FINALIZED';
    end if;

    delete from public.os_kiosk_board kb
    where kb.order_key = p_order_key;

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

    if v_next_status is not null then
      update public.os o
        set status_producao = v_next_status,
            updated_at = now()
      where o.id = v_card.source_id
      returning
        o.os_number,
        o.sale_number,
        coalesce(nullif(o.client_name, ''), o.customer_name),
        o.title,
        coalesce(o.description, o.notes),
        o.address,
        o.delivery_date,
        o.delivery_type,
        o.status_producao
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
    else
      select
        o.os_number,
        o.sale_number,
        coalesce(nullif(o.client_name, ''), o.customer_name),
        o.title,
        coalesce(o.description, o.notes),
        o.address,
        o.delivery_date,
        o.delivery_type,
        o.status_producao
      into
        v_card.os_number,
        v_card.sale_number,
        v_card.client_name,
        v_card.title,
        v_card.description,
        v_card.address,
        v_card.delivery_date,
        v_card.delivery_mode,
        v_card.upstream_status
      from public.os o
      where o.id = v_card.source_id;

      if not found then
        raise exception 'Entidade upstream não encontrada para movimentação.'
          using errcode = 'P0001', detail = 'KIOSK_UPSTREAM_NOT_FOUND';
      end if;
    end if;
  else
    v_previous_upstream_status := v_card.upstream_status;

    if v_next_status is not null or v_next_tag is not null then
      update public.os_orders oo
        set prod_status = coalesce(v_next_status, oo.prod_status),
            production_tag = coalesce(v_next_tag, oo.production_tag),
            updated_at = now(),
            updated_by = coalesce(p_actor_id, oo.updated_by)
      where oo.id = v_card.source_id
      returning
        oo.os_number,
        oo.sale_number,
        oo.client_name,
        oo.title,
        oo.description,
        oo.address,
        oo.delivery_date,
        oo.logistic_type,
        oo.production_tag,
        oo.prod_status
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
    else
      select
        oo.os_number,
        oo.sale_number,
        oo.client_name,
        oo.title,
        oo.description,
        oo.address,
        oo.delivery_date,
        oo.logistic_type,
        oo.production_tag,
        oo.prod_status
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
        v_card.upstream_status
      from public.os_orders oo
      where oo.id = v_card.source_id;

      if not found then
        raise exception 'Entidade upstream não encontrada para movimentação.'
          using errcode = 'P0001', detail = 'KIOSK_UPSTREAM_NOT_FOUND';
      end if;
    end if;
  end if;

  update public.os_kiosk_board kb
    set current_stage = v_next_stage,
        material_ready = case
          when p_action in ('to_installations', 'to_ready_notify') then true
          else kb.material_ready
        end,
        terminal_id = coalesce(p_terminal_id, kb.terminal_id),
        updated_by = coalesce(p_actor_id, kb.updated_by),
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
  where kb.order_key = p_order_key
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
