-- Hardening: remove broad os_orders update for consultor and enforce RPC whitelist.

drop policy if exists "os_orders_update_consultor_admin" on public.os_orders;
drop policy if exists "os_orders_update_manager_only" on public.os_orders;

create policy "os_orders_update_manager_only"
  on public.os_orders
  for update
  to authenticated
  using (
    public.has_module_access(auth.uid(), 'hub_os')
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'gerente')
    )
  )
  with check (
    public.has_module_access(auth.uid(), 'hub_os')
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'gerente')
    )
  );

create or replace function public.update_os_order_consultor(
  p_os_id uuid,
  p_payload jsonb
)
returns public.os_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_allowed_keys text[] := array[
    'sale_number',
    'client_name',
    'title',
    'description',
    'delivery_date',
    'delivery_deadline_preset',
    'delivery_deadline_started_at',
    'logistic_type',
    'address',
    'art_direction_tag',
    'art_status',
    'prod_status',
    'production_tag',
    'insumos_details',
    'insumos_return_notes',
    'insumos_requested_at',
    'insumos_resolved_at',
    'insumos_resolved_by',
    'updated_at',
    'updated_by'
  ];
  v_forbidden text[];
  v_updated public.os_orders;
  v_is_manager boolean;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not public.has_module_access(v_uid, 'hub_os') then
    raise exception 'Usuário sem acesso ao módulo hub_os.' using errcode = '42501';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_uid;

  if v_role is null then
    raise exception 'Perfil do usuário não encontrado.' using errcode = '42501';
  end if;

  v_is_manager := v_role in ('admin', 'gerente');
  if not v_is_manager and v_role not in ('consultor', 'consultor_vendas') then
    raise exception 'Somente consultor_vendas ou gerente/admin podem usar esta função.' using errcode = '42501';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Payload inválido.' using errcode = '22023';
  end if;

  select array_agg(key)
  into v_forbidden
  from jsonb_object_keys(p_payload) as key
  where key <> all(v_allowed_keys);

  if coalesce(array_length(v_forbidden, 1), 0) > 0 then
    raise exception 'Campos não permitidos: %', array_to_string(v_forbidden, ', ')
      using errcode = '22023';
  end if;

  if p_payload ? 'logistic_type' and p_payload->>'logistic_type' = 'instalacao' then
    if not (p_payload ? 'address') or nullif(trim(coalesce(p_payload->>'address', '')), '') is null then
      raise exception 'Endereço é obrigatório quando logistic_type=instalacao.' using errcode = '22023';
    end if;
  end if;

  if p_payload ? 'production_tag' and p_payload->>'production_tag' = 'AGUARDANDO_INSUMOS' then
    if not (p_payload ? 'insumos_details') or nullif(trim(coalesce(p_payload->>'insumos_details', '')), '') is null then
      raise exception 'insumos_details é obrigatório para AGUARDANDO_INSUMOS.' using errcode = '22023';
    end if;
  end if;

  update public.os_orders o
  set
    sale_number = case when p_payload ? 'sale_number' then p_payload->>'sale_number' else o.sale_number end,
    client_name = case when p_payload ? 'client_name' then p_payload->>'client_name' else o.client_name end,
    title = case when p_payload ? 'title' then nullif(p_payload->>'title', '') else o.title end,
    description = case when p_payload ? 'description' then nullif(p_payload->>'description', '') else o.description end,
    delivery_date = case when p_payload ? 'delivery_date' then nullif(p_payload->>'delivery_date', '')::date else o.delivery_date end,
    delivery_deadline_preset = case when p_payload ? 'delivery_deadline_preset' then nullif(p_payload->>'delivery_deadline_preset', '') else o.delivery_deadline_preset end,
    delivery_deadline_started_at = case when p_payload ? 'delivery_deadline_started_at' then nullif(p_payload->>'delivery_deadline_started_at', '')::timestamptz else o.delivery_deadline_started_at end,
    logistic_type = case when p_payload ? 'logistic_type' then p_payload->>'logistic_type' else o.logistic_type end,
    address = case when p_payload ? 'address' then nullif(p_payload->>'address', '') else o.address end,
    art_direction_tag = case when p_payload ? 'art_direction_tag' then nullif(p_payload->>'art_direction_tag', '') else o.art_direction_tag end,
    art_status = case when p_payload ? 'art_status' then p_payload->>'art_status' else o.art_status end,
    prod_status = case when p_payload ? 'prod_status' then nullif(p_payload->>'prod_status', '') else o.prod_status end,
    production_tag = case when p_payload ? 'production_tag' then nullif(p_payload->>'production_tag', '') else o.production_tag end,
    insumos_details = case when p_payload ? 'insumos_details' then nullif(p_payload->>'insumos_details', '') else o.insumos_details end,
    insumos_return_notes = case when p_payload ? 'insumos_return_notes' then nullif(p_payload->>'insumos_return_notes', '') else o.insumos_return_notes end,
    insumos_requested_at = case when p_payload ? 'insumos_requested_at' then nullif(p_payload->>'insumos_requested_at', '')::timestamptz else o.insumos_requested_at end,
    insumos_resolved_at = case when p_payload ? 'insumos_resolved_at' then nullif(p_payload->>'insumos_resolved_at', '')::timestamptz else o.insumos_resolved_at end,
    insumos_resolved_by = case when p_payload ? 'insumos_resolved_by' then nullif(p_payload->>'insumos_resolved_by', '')::uuid else o.insumos_resolved_by end,
    updated_at = case when p_payload ? 'updated_at' then coalesce((p_payload->>'updated_at')::timestamptz, now()) else now() end,
    updated_by = case when p_payload ? 'updated_by' then nullif(p_payload->>'updated_by', '')::uuid else v_uid end
  where o.id = p_os_id
  returning o.* into v_updated;

  if v_updated.id is null then
    raise exception 'OS não encontrada.' using errcode = 'P0002';
  end if;

  insert into public.os_orders_event (os_id, type, payload, created_by, created_at)
  values (
    p_os_id,
    'consultor_update',
    jsonb_build_object('fields', (select jsonb_agg(key) from jsonb_object_keys(p_payload) as key)),
    v_uid,
    now()
  );

  return v_updated;
end;
$$;

grant execute on function public.update_os_order_consultor(uuid, jsonb) to authenticated;
