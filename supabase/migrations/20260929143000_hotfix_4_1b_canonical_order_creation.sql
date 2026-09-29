-- Hotfix 4.1b: canonical OS creation is role-restricted and RPC-only.

create or replace function public.hub_os_create_order_secure(
  p_payload jsonb,
  p_event_type text default 'create',
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
  v_inserted public.os_orders;
  v_sale_number text := nullif(trim(coalesce(p_payload->>'sale_number', '')), '');
  v_client_name text := nullif(trim(coalesce(p_payload->>'client_name', '')), '');
begin
  select case p.role
    when 'admin' then 'gerente'
    when 'consultor' then 'consultor_vendas'
    else p.role
  end
  into v_role
  from public.profiles p
  where p.id = v_uid;

  if v_role is null or v_role not in ('gerente', 'consultor_vendas') then
    raise exception 'Somente gerente ou consultor de vendas pode criar OS.' using errcode = '42501';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Payload inválido.' using errcode = '22023';
  end if;

  if v_sale_number is null or v_client_name is null then
    raise exception 'sale_number e client_name são obrigatórios.' using errcode = '22023';
  end if;

  insert into public.os_orders (
    sale_number, client_name, title, description, delivery_date,
    delivery_deadline_preset, delivery_deadline_started_at, logistic_type,
    address, art_direction_tag, production_tag, insumos_details,
    insumos_return_notes, insumos_requested_at, insumos_resolved_at,
    insumos_resolved_by, art_status, prod_status, reproducao, letra_caixa,
    archived, archived_at, archived_by, created_by, updated_by, created_at,
    updated_at
  ) values (
    v_sale_number,
    v_client_name,
    nullif(trim(coalesce(p_payload->>'title', '')), ''),
    nullif(trim(coalesce(p_payload->>'description', '')), ''),
    nullif(trim(coalesce(p_payload->>'delivery_date', '')), '')::date,
    nullif(trim(coalesce(p_payload->>'delivery_deadline_preset', '')), ''),
    nullif(trim(coalesce(p_payload->>'delivery_deadline_started_at', '')), '')::timestamptz,
    coalesce(nullif(trim(coalesce(p_payload->>'logistic_type', '')), ''), 'retirada'),
    nullif(trim(coalesce(p_payload->>'address', '')), ''),
    nullif(trim(coalesce(p_payload->>'art_direction_tag', '')), ''),
    nullif(trim(coalesce(p_payload->>'production_tag', '')), ''),
    nullif(trim(coalesce(p_payload->>'insumos_details', '')), ''),
    nullif(trim(coalesce(p_payload->>'insumos_return_notes', '')), ''),
    nullif(trim(coalesce(p_payload->>'insumos_requested_at', '')), '')::timestamptz,
    nullif(trim(coalesce(p_payload->>'insumos_resolved_at', '')), '')::timestamptz,
    nullif(trim(coalesce(p_payload->>'insumos_resolved_by', '')), '')::uuid,
    'Caixa de Entrada',
    null,
    coalesce((p_payload->>'reproducao')::boolean, false),
    coalesce((p_payload->>'letra_caixa')::boolean, false),
    false,
    null,
    null,
    v_uid,
    v_uid,
    now(),
    now()
  ) returning * into v_inserted;

  if p_event_type is not null then
    insert into public.os_orders_event (os_id, type, payload, created_by, created_at)
    values (v_inserted.id, p_event_type, coalesce(p_event_payload, '{}'::jsonb), v_uid, now());
  end if;

  return v_inserted;
end;
$$;

drop policy if exists "os_orders_insert_authenticated" on public.os_orders;
revoke insert on table public.os_orders from authenticated, anon;

revoke execute on function public.hub_os_create_order_secure(jsonb, text, jsonb)
  from public, anon;
grant execute on function public.hub_os_create_order_secure(jsonb, text, jsonb)
  to authenticated;
