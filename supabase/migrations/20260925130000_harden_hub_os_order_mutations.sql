-- Evolução OS 2.0 — Fase 2.2
-- The UI provides early feedback; these server-side contracts are authoritative.

create or replace function public.hub_os_can_transition_art(p_from text, p_to text)
returns boolean
language sql
immutable
security invoker
set search_path = public
as $$
  select (p_from, p_to) in (
    ('Caixa de Entrada', 'Em Criação'),
    ('Em Criação', 'Para Aprovação'),
    ('Para Aprovação', 'Ajustes'),
    ('Para Aprovação', 'Produzir'),
    ('Ajustes', 'Em Criação'),
    ('Ajustes', 'Para Aprovação')
  );
$$;

create or replace function public.hub_os_can_transition_production(p_from text, p_to text)
returns boolean
language sql
immutable
security invoker
set search_path = public
as $$
  select (p_from, p_to) in (
    ('Produção', 'Em Acabamento'),
    ('Em Acabamento', 'Pronto / Avisar Cliente'),
    ('Pronto / Avisar Cliente', 'Logística (Entrega/Transportadora)'),
    ('Pronto / Avisar Cliente', 'Instalação Agendada'),
    ('Pronto / Avisar Cliente', 'Finalizados'),
    ('Logística (Entrega/Transportadora)', 'Instalação Agendada'),
    ('Logística (Entrega/Transportadora)', 'Finalizados'),
    ('Instalação Agendada', 'Finalizados')
  );
$$;

create or replace function public.hub_os_update_order_secure(
  p_os_id uuid,
  p_patch jsonb,
  p_event_type text default null,
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
  v_updated public.os_orders;
  v_allowed_keys text[] := array[
    'sale_number','client_name','title','description','delivery_date','delivery_deadline_preset','delivery_deadline_started_at',
    'logistic_type','address','art_direction_tag','production_tag','insumos_details','insumos_return_notes',
    'insumos_requested_at','insumos_resolved_at','insumos_resolved_by','reproducao','letra_caixa'
  ];
  v_forbidden text[];
begin
  select p.role into v_role from public.profiles p where p.id = v_uid;
  if v_role is null or v_role not in ('admin', 'gerente') then
    raise exception 'Apenas gerente/admin podem editar a OS.' using errcode = '42501';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Patch inválido.' using errcode = '22023';
  end if;

  select array_agg(key order by key)
    into v_forbidden
  from jsonb_object_keys(p_patch) as key
  where key <> all(v_allowed_keys);

  if coalesce(array_length(v_forbidden, 1), 0) > 0 then
    raise exception 'Campos não permitidos: %', array_to_string(v_forbidden, ', ') using errcode = '22023';
  end if;

  update public.os_orders o
  set
    sale_number = case when p_patch ? 'sale_number' then nullif(trim(coalesce(p_patch->>'sale_number', '')), '') else o.sale_number end,
    client_name = case when p_patch ? 'client_name' then nullif(trim(coalesce(p_patch->>'client_name', '')), '') else o.client_name end,
    title = case when p_patch ? 'title' then nullif(trim(coalesce(p_patch->>'title', '')), '') else o.title end,
    description = case when p_patch ? 'description' then nullif(trim(coalesce(p_patch->>'description', '')), '') else o.description end,
    delivery_date = case when p_patch ? 'delivery_date' then nullif(trim(coalesce(p_patch->>'delivery_date', '')), '')::date else o.delivery_date end,
    delivery_deadline_preset = case when p_patch ? 'delivery_deadline_preset' then nullif(trim(coalesce(p_patch->>'delivery_deadline_preset', '')), '') else o.delivery_deadline_preset end,
    delivery_deadline_started_at = case when p_patch ? 'delivery_deadline_started_at' then nullif(trim(coalesce(p_patch->>'delivery_deadline_started_at', '')), '')::timestamptz else o.delivery_deadline_started_at end,
    logistic_type = case when p_patch ? 'logistic_type' then nullif(trim(coalesce(p_patch->>'logistic_type', '')), '') else o.logistic_type end,
    address = case when p_patch ? 'address' then nullif(trim(coalesce(p_patch->>'address', '')), '') else o.address end,
    art_direction_tag = case when p_patch ? 'art_direction_tag' then nullif(trim(coalesce(p_patch->>'art_direction_tag', '')), '') else o.art_direction_tag end,
    production_tag = case when p_patch ? 'production_tag' then nullif(trim(coalesce(p_patch->>'production_tag', '')), '') else o.production_tag end,
    insumos_details = case when p_patch ? 'insumos_details' then nullif(trim(coalesce(p_patch->>'insumos_details', '')), '') else o.insumos_details end,
    insumos_return_notes = case when p_patch ? 'insumos_return_notes' then nullif(trim(coalesce(p_patch->>'insumos_return_notes', '')), '') else o.insumos_return_notes end,
    insumos_requested_at = case when p_patch ? 'insumos_requested_at' then nullif(trim(coalesce(p_patch->>'insumos_requested_at', '')), '')::timestamptz else o.insumos_requested_at end,
    insumos_resolved_at = case when p_patch ? 'insumos_resolved_at' then nullif(trim(coalesce(p_patch->>'insumos_resolved_at', '')), '')::timestamptz else o.insumos_resolved_at end,
    insumos_resolved_by = case when p_patch ? 'insumos_resolved_by' then nullif(trim(coalesce(p_patch->>'insumos_resolved_by', '')), '')::uuid else o.insumos_resolved_by end,
    reproducao = case when p_patch ? 'reproducao' then coalesce((p_patch->>'reproducao')::boolean, false) else o.reproducao end,
    letra_caixa = case when p_patch ? 'letra_caixa' then coalesce((p_patch->>'letra_caixa')::boolean, false) else o.letra_caixa end,
    updated_at = now(),
    updated_by = v_uid
  where o.id = p_os_id
  returning * into v_updated;

  if v_updated.id is null then
    raise exception 'OS não encontrada.' using errcode = 'P0002';
  end if;

  if p_event_type is not null then
    insert into public.os_orders_event (os_id, type, payload, created_by, created_at)
    values (p_os_id, p_event_type, coalesce(p_event_payload, '{}'::jsonb), v_uid, now());
  end if;

  return v_updated;
end;
$$;

create or replace function public.hub_os_move_order_secure(
  p_os_id uuid,
  p_next_art_status text default null,
  p_next_prod_status text default null,
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
  v_board text;
  v_from text;
  v_to text;
  v_payload jsonb;
begin
  select p.role into v_role from public.profiles p where p.id = v_uid;

  select * into v_order
  from public.os_orders o
  where o.id = p_os_id
  for update;

  if v_order.id is null then
    raise exception 'OS não encontrada.' using errcode = 'P0002';
  end if;

  if coalesce(v_order.archived, false) or v_order.prod_status = 'Finalizados' then
    raise exception 'OS finalizada/arquivada não pode mudar de etapa.' using errcode = '22023';
  end if;

  if p_next_art_status is not null and p_next_prod_status is null then
    v_board := 'art';
  elsif p_next_art_status = 'Produzir' and p_next_prod_status = 'Produção' then
    v_board := 'art';
  elsif p_next_art_status is null and p_next_prod_status is not null then
    v_board := 'production';
  else
    raise exception 'Combinação de status inválida.' using errcode = '22023';
  end if;

  if v_board = 'art' then
    if v_role is null or v_role not in ('admin', 'gerente', 'arte_finalista') then
      raise exception 'Usuário não autorizado para mover este setor.' using errcode = '42501';
    end if;
    if not public.hub_os_can_transition_art(v_order.art_status, p_next_art_status) then
      raise exception 'Transição de Arte inválida.' using errcode = '22023';
    end if;
    v_from := v_order.art_status;
    v_to := p_next_art_status;

    update public.os_orders o
    set art_status = p_next_art_status,
        prod_status = case when p_next_art_status = 'Produzir' then 'Produção' else o.prod_status end,
        updated_at = now(),
        updated_by = v_uid
    where o.id = p_os_id
    returning * into v_updated;
  else
    if v_role is null or v_role not in ('admin', 'gerente', 'producao') then
      raise exception 'Usuário não autorizado para mover este setor.' using errcode = '42501';
    end if;
    if not public.hub_os_can_transition_production(v_order.prod_status, p_next_prod_status) then
      raise exception 'Transição de Produção inválida.' using errcode = '22023';
    end if;
    v_from := v_order.prod_status;
    v_to := p_next_prod_status;

    update public.os_orders o
    set prod_status = p_next_prod_status,
        updated_at = now(),
        updated_by = v_uid
    where o.id = p_os_id
    returning * into v_updated;
  end if;

  v_payload := (coalesce(p_event_payload, '{}'::jsonb) - array['board', 'from', 'to', 'actor'])
    || jsonb_build_object('board', v_board, 'from', v_from, 'to', v_to, 'actor', v_uid);

  insert into public.os_orders_event (os_id, type, payload, created_by, created_at)
  values (p_os_id, 'status_change', v_payload, v_uid, now());

  return v_updated;
end;
$$;

create or replace function public.hub_os_archive_order_secure(
  p_os_id uuid,
  p_reason text default 'archive',
  p_payload jsonb default '{}'::jsonb
)
returns public.os_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.hub_os_assert_orders_access();
  v_role text;
  v_updated public.os_orders;
begin
  select p.role into v_role from public.profiles p where p.id = v_uid;
  if v_role is null or v_role not in ('admin', 'gerente') then
    raise exception 'Apenas gerente/admin podem editar a OS.' using errcode = '42501';
  end if;

  update public.os_orders o
  set archived = true, archived_at = now(), archived_by = v_uid,
      updated_at = now(), updated_by = v_uid
  where o.id = p_os_id
  returning * into v_updated;

  if v_updated.id is null then
    raise exception 'OS não encontrada.' using errcode = 'P0002';
  end if;

  insert into public.os_orders_event (os_id, type, payload, created_by, created_at)
  values (
    p_os_id,
    'archive',
    (coalesce(p_payload, '{}'::jsonb) - array['actor', 'reason'])
      || jsonb_build_object('actor', v_uid, 'reason', p_reason),
    v_uid,
    now()
  );

  return v_updated;
end;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default when a function is created.
-- Revoke that implicit grant before explicitly allowing authenticated callers.
revoke execute on function public.hub_os_can_transition_art(text, text) from public, anon, authenticated;
revoke execute on function public.hub_os_can_transition_production(text, text) from public, anon, authenticated;

revoke execute on function public.hub_os_assert_orders_access() from public, anon;
revoke execute on function public.hub_os_create_order_secure(jsonb, text, jsonb) from public, anon;
revoke execute on function public.hub_os_update_order_secure(uuid, jsonb, text, jsonb) from public, anon;
revoke execute on function public.hub_os_archive_order_secure(uuid, text, jsonb) from public, anon;
revoke execute on function public.hub_os_move_order_secure(uuid, text, text, jsonb) from public, anon;
revoke execute on function public.hub_os_delete_order_secure(uuid, text, jsonb) from public, anon;

grant execute on function public.hub_os_assert_orders_access() to authenticated;
grant execute on function public.hub_os_create_order_secure(jsonb, text, jsonb) to authenticated;
grant execute on function public.hub_os_update_order_secure(uuid, jsonb, text, jsonb) to authenticated;
grant execute on function public.hub_os_archive_order_secure(uuid, text, jsonb) to authenticated;
grant execute on function public.hub_os_move_order_secure(uuid, text, text, jsonb) to authenticated;
grant execute on function public.hub_os_delete_order_secure(uuid, text, jsonb) to authenticated;
