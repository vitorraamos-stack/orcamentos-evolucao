-- Evolução OS 2.0 — Fase 2.2.1
-- Restore operational workflows through narrow, atomic server-side contracts.

create or replace function public.hub_os_send_to_production_secure(
  p_os_id uuid,
  p_delivery_deadline_started_at timestamptz,
  p_delivery_date date,
  p_event_payload jsonb default '{}'::jsonb
)
returns public.os_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.hub_os_assert_orders_access();
  v_role text;
  v_order public.os_orders;
  v_updated public.os_orders;
  v_payload jsonb;
begin
  select p.role into v_role from public.profiles p where p.id = v_uid;
  if v_role is null or v_role not in ('admin', 'gerente', 'arte_finalista') then
    raise exception 'Usuário não autorizado para enviar a OS à Produção.' using errcode = '42501';
  end if;

  if p_delivery_deadline_started_at is null or p_delivery_date is null then
    raise exception 'Início e data final do prazo são obrigatórios.' using errcode = '22023';
  end if;

  select * into v_order from public.os_orders o where o.id = p_os_id for update;
  if v_order.id is null then
    raise exception 'OS não encontrada.' using errcode = 'P0002';
  end if;
  if coalesce(v_order.archived, false) or v_order.prod_status = 'Finalizados' then
    raise exception 'OS finalizada/arquivada não pode iniciar Produção.' using errcode = '22023';
  end if;
  if v_order.art_status <> 'Para Aprovação' or v_order.prod_status is not null then
    raise exception 'A OS deve estar em Para Aprovação e fora da Produção.' using errcode = '22023';
  end if;

  update public.os_orders o
  set art_status = 'Produzir', prod_status = 'Produção',
      delivery_deadline_started_at = p_delivery_deadline_started_at,
      delivery_date = p_delivery_date, updated_by = v_uid, updated_at = now()
  where o.id = p_os_id returning * into v_updated;

  v_payload := (coalesce(p_event_payload, '{}'::jsonb)
    - array['board', 'from', 'to', 'actor', 'production_started',
            'delivery_deadline_started_at', 'delivery_date'])
    || jsonb_build_object(
      'board', 'art', 'from', v_order.art_status, 'to', 'Produzir',
      'actor', v_uid, 'production_started', true,
      'delivery_deadline_started_at', p_delivery_deadline_started_at,
      'delivery_date', p_delivery_date
    );
  insert into public.os_orders_event (os_id, type, payload, created_by, created_at)
  values (p_os_id, 'status_change', v_payload, v_uid, now());
  return v_updated;
end;
$$;

create or replace function public.hub_os_return_order_to_art_secure(
  p_os_id uuid,
  p_reason text default null,
  p_event_payload jsonb default '{}'::jsonb
)
returns public.os_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.hub_os_assert_orders_access();
  v_role text;
  v_order public.os_orders;
  v_updated public.os_orders;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_payload jsonb;
begin
  select p.role into v_role from public.profiles p where p.id = v_uid;
  if v_role is null or v_role not in ('admin', 'gerente') then
    raise exception 'Apenas gerente/admin podem retornar a OS para Arte.' using errcode = '42501';
  end if;
  select * into v_order from public.os_orders o where o.id = p_os_id for update;
  if v_order.id is null then raise exception 'OS não encontrada.' using errcode = 'P0002'; end if;
  if coalesce(v_order.archived, false) then
    raise exception 'OS arquivada não pode retornar para Arte.' using errcode = '22023';
  end if;
  if v_order.prod_status is null then
    raise exception 'A OS não está no fluxo de Produção.' using errcode = '22023';
  end if;

  update public.os_orders o
  set art_status = 'Caixa de Entrada', prod_status = null,
      updated_by = v_uid, updated_at = now()
  where o.id = p_os_id returning * into v_updated;

  v_payload := (coalesce(p_event_payload, '{}'::jsonb)
    - array['from_art_status', 'from_prod_status', 'to_art_status', 'reason', 'actor'])
    || jsonb_build_object(
      'from_art_status', v_order.art_status, 'from_prod_status', v_order.prod_status,
      'to_art_status', 'Caixa de Entrada', 'reason', v_reason, 'actor', v_uid
    );
  insert into public.os_orders_event (os_id, type, payload, created_by, created_at)
  values (p_os_id, 'returned_to_art', v_payload, v_uid, now());
  return v_updated;
end;
$$;

create or replace function public.hub_os_set_production_tag_secure(
  p_os_id uuid,
  p_production_tag text,
  p_insumos_details text default null
)
returns public.os_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.hub_os_assert_orders_access();
  v_role text;
  v_order public.os_orders;
  v_updated public.os_orders;
  v_tag text := nullif(trim(coalesce(p_production_tag, '')), '');
  v_details text := nullif(trim(coalesce(p_insumos_details, '')), '');
begin
  select p.role into v_role from public.profiles p where p.id = v_uid;
  if v_role is null or v_role not in ('admin', 'gerente', 'producao') then
    raise exception 'Usuário não autorizado para alterar a tag de Produção.' using errcode = '42501';
  end if;
  if v_tag is null or v_tag not in ('EM_PRODUCAO', 'PRONTO', 'AGUARDANDO_INSUMOS', 'PRODUCAO_EXTERNA') then
    raise exception 'Tag de Produção inválida.' using errcode = '22023';
  end if;
  if v_tag = 'AGUARDANDO_INSUMOS' and v_details is null then
    raise exception 'Detalhes de insumos são obrigatórios.' using errcode = '22023';
  end if;
  select * into v_order from public.os_orders o where o.id = p_os_id for update;
  if v_order.id is null then raise exception 'OS não encontrada.' using errcode = 'P0002'; end if;
  if coalesce(v_order.archived, false) or v_order.prod_status is null or v_order.prod_status = 'Finalizados' then
    raise exception 'A OS não está em uma etapa de Produção editável.' using errcode = '22023';
  end if;

  update public.os_orders o
  set production_tag = v_tag,
      insumos_details = case when v_tag = 'AGUARDANDO_INSUMOS' then v_details else o.insumos_details end,
      updated_by = v_uid, updated_at = now()
  where o.id = p_os_id returning * into v_updated;
  insert into public.os_orders_event (os_id, type, payload, created_by, created_at)
  values (p_os_id, 'production_tag_changed', jsonb_build_object(
    'from', v_order.production_tag, 'to', v_tag,
    'has_insumos_details', v_details is not null, 'actor', v_uid
  ), v_uid, now());
  return v_updated;
end;
$$;

create or replace function public.hub_os_update_insumos_secure(
  p_os_id uuid,
  p_action text,
  p_notes text default null
)
returns public.os_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.hub_os_assert_orders_access();
  v_role text;
  v_order public.os_orders;
  v_updated public.os_orders;
  v_action text := upper(trim(coalesce(p_action, '')));
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
begin
  select p.role into v_role from public.profiles p where p.id = v_uid;
  if v_role is null or v_role not in ('admin', 'gerente', 'producao') then
    raise exception 'Usuário não autorizado para atualizar insumos.' using errcode = '42501';
  end if;
  if v_action not in ('REQUEST', 'RESOLVE', 'ACKNOWLEDGE') then
    raise exception 'Ação de insumos inválida.' using errcode = '22023';
  end if;
  if v_action in ('REQUEST', 'RESOLVE') and v_notes is null then
    raise exception 'Observações de insumos são obrigatórias.' using errcode = '22023';
  end if;
  select * into v_order from public.os_orders o where o.id = p_os_id for update;
  if v_order.id is null then raise exception 'OS não encontrada.' using errcode = 'P0002'; end if;
  if coalesce(v_order.archived, false) or v_order.prod_status is null or v_order.prod_status = 'Finalizados' then
    raise exception 'A OS não está em uma etapa de Produção editável.' using errcode = '22023';
  end if;

  update public.os_orders o set
    production_tag = case when v_action = 'REQUEST' then 'AGUARDANDO_INSUMOS' else 'EM_PRODUCAO' end,
    insumos_details = case when v_action = 'REQUEST' then v_notes else o.insumos_details end,
    insumos_requested_at = case when v_action = 'REQUEST' then coalesce(o.insumos_requested_at, now()) else o.insumos_requested_at end,
    insumos_return_notes = case when v_action = 'RESOLVE' then v_notes when v_action in ('REQUEST', 'ACKNOWLEDGE') then null else o.insumos_return_notes end,
    insumos_resolved_at = case when v_action = 'RESOLVE' then now() when v_action = 'REQUEST' then null else o.insumos_resolved_at end,
    insumos_resolved_by = case when v_action = 'RESOLVE' then v_uid when v_action = 'REQUEST' then null else o.insumos_resolved_by end,
    updated_by = v_uid, updated_at = now()
  where o.id = p_os_id returning * into v_updated;
  insert into public.os_orders_event (os_id, type, payload, created_by, created_at)
  values (p_os_id, case when v_action = 'ACKNOWLEDGE' then 'insumos_acknowledged' else 'production_tag_changed' end,
    jsonb_build_object('from', v_order.production_tag, 'to', v_updated.production_tag,
      'insumos_action', v_action, 'has_insumos_details', v_notes is not null, 'actor', v_uid), v_uid, now());
  return v_updated;
end;
$$;

revoke execute on function public.hub_os_send_to_production_secure(uuid,timestamptz,date,jsonb) from public, anon;
revoke execute on function public.hub_os_return_order_to_art_secure(uuid,text,jsonb) from public, anon;
revoke execute on function public.hub_os_set_production_tag_secure(uuid,text,text) from public, anon;
revoke execute on function public.hub_os_update_insumos_secure(uuid,text,text) from public, anon;
grant execute on function public.hub_os_send_to_production_secure(uuid,timestamptz,date,jsonb) to authenticated;
grant execute on function public.hub_os_return_order_to_art_secure(uuid,text,jsonb) to authenticated;
grant execute on function public.hub_os_set_production_tag_secure(uuid,text,text) to authenticated;
grant execute on function public.hub_os_update_insumos_secure(uuid,text,text) to authenticated;
