-- Phase 4.2a: harden the atomic pickup completion boundary.
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
  v_actor_id uuid := public.hub_os_assert_logistics_actor('DELIVERY');
  v_order public.os_orders;
  v_existing public.hub_os_order_flow_state;
  v_flow_row public.hub_os_order_flow_state;
  v_prev_prod_status text;
  v_order_updated_at timestamptz;
  v_order_prod_status text;
  v_already_retirado boolean;
begin
  if p_source_type is distinct from 'os_orders' then
    raise exception 'Fonte inválida para retirada.'
      using errcode = 'P0001', detail = 'PICKUP_INVALID_SOURCE';
  end if;

  if p_order_key is distinct from 'os_orders:' || p_source_id::text then
    raise exception 'Chave da OS incompatível com a retirada.'
      using errcode = 'P0001', detail = 'PICKUP_KEY_MISMATCH';
  end if;

  select *
    into v_order
  from public.os_orders
  where id = p_source_id
  for update;

  if not found then
    raise exception 'OS não encontrada.'
      using errcode = 'P0001', detail = 'PICKUP_ORDER_NOT_FOUND';
  end if;

  if v_order.archived = true then
    raise exception 'OS arquivada não pode ser retirada.'
      using errcode = 'P0001', detail = 'PICKUP_ORDER_ARCHIVED';
  end if;

  if v_order.logistic_type is distinct from 'retirada' then
    raise exception 'Esta OS não está configurada para retirada.'
      using errcode = 'P0001', detail = 'PICKUP_WRONG_LOGISTICS';
  end if;

  if v_order.prod_status is null
     or v_order.prod_status not in ('Pronto / Avisar Cliente', 'Finalizados') then
    raise exception 'OS ainda não está disponível para retirada.'
      using errcode = 'P0001', detail = 'PICKUP_NOT_READY';
  end if;

  select *
    into v_existing
  from public.hub_os_order_flow_state
  where hub_os_order_flow_state.order_key = p_order_key
  for update;

  v_already_retirado := v_existing.retirado_at is not null;
  v_prev_prod_status := v_order.prod_status;

  insert into public.hub_os_order_flow_state (
    order_key, source_type, source_id, avisado_at, avisado_by, retirado_at, retirado_by
  ) values (
    p_order_key, p_source_type, p_source_id, null, null, now(), v_actor_id
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

  update public.os_orders
     set prod_status = 'Finalizados',
         updated_at = now(),
         updated_by = v_actor_id
   where id = v_order.id
  returning os_orders.prod_status, os_orders.updated_at
    into v_order_prod_status, v_order_updated_at;

  if not v_already_retirado then
    if v_prev_prod_status <> 'Finalizados' then
      insert into public.os_orders_event (os_id, type, payload, created_by, created_at)
      values (
        v_order.id,
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
    end if;

    insert into public.os_orders_event (os_id, type, payload, created_by, created_at)
    values (
      v_order.id,
      'avisado_toggle',
      jsonb_build_object('avisado', false, 'actor_name', p_actor_name),
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

revoke execute on function public.order_flow_mark_retirado_and_finalize_secure(text, text, uuid, text)
  from public, anon;
grant execute on function public.order_flow_mark_retirado_and_finalize_secure(text, text, uuid, text)
  to authenticated;
