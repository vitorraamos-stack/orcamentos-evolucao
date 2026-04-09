-- Hardening: centralize os_orders mutations and os_orders_event audit ownership on server-side RPCs.

create or replace function public.hub_os_assert_orders_access()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not public.has_module_access(v_uid, 'hub_os') then
    raise exception 'Usuário sem acesso ao módulo hub_os.' using errcode = '42501';
  end if;

  return v_uid;
end;
$$;

create or replace function public.hub_os_orders_event_server_sanitize()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_at := now();
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_os_orders_event_server_sanitize on public.os_orders_event;
create trigger trg_os_orders_event_server_sanitize
before insert on public.os_orders_event
for each row
execute procedure public.hub_os_orders_event_server_sanitize();

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
  v_inserted public.os_orders;
  v_sale_number text := nullif(trim(coalesce(p_payload->>'sale_number', '')), '');
  v_client_name text := nullif(trim(coalesce(p_payload->>'client_name', '')), '');
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Payload inválido.' using errcode = '22023';
  end if;

  if v_sale_number is null or v_client_name is null then
    raise exception 'sale_number e client_name são obrigatórios.' using errcode = '22023';
  end if;

  insert into public.os_orders (
    sale_number,
    client_name,
    title,
    description,
    delivery_date,
    delivery_deadline_preset,
    delivery_deadline_started_at,
    logistic_type,
    address,
    art_direction_tag,
    production_tag,
    insumos_details,
    insumos_return_notes,
    insumos_requested_at,
    insumos_resolved_at,
    insumos_resolved_by,
    art_status,
    prod_status,
    reproducao,
    letra_caixa,
    archived,
    archived_at,
    archived_by,
    created_by,
    updated_by,
    created_at,
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
    coalesce(nullif(trim(coalesce(p_payload->>'art_status', '')), ''), 'Caixa de Entrada'),
    nullif(trim(coalesce(p_payload->>'prod_status', '')), ''),
    coalesce((p_payload->>'reproducao')::boolean, false),
    coalesce((p_payload->>'letra_caixa')::boolean, false),
    coalesce((p_payload->>'archived')::boolean, false),
    nullif(trim(coalesce(p_payload->>'archived_at', '')), '')::timestamptz,
    nullif(trim(coalesce(p_payload->>'archived_by', '')), '')::uuid,
    v_uid,
    v_uid,
    now(),
    now()
  )
  returning * into v_inserted;

  if p_event_type is not null then
    insert into public.os_orders_event (os_id, type, payload, created_by, created_at)
    values (
      v_inserted.id,
      p_event_type,
      coalesce(p_event_payload, '{}'::jsonb),
      v_uid,
      now()
    );
  end if;

  return v_inserted;
end;
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
  v_updated public.os_orders;
  v_allowed_keys text[] := array[
    'sale_number','client_name','title','description','delivery_date','delivery_deadline_preset','delivery_deadline_started_at',
    'logistic_type','address','art_direction_tag','art_status','prod_status','production_tag','insumos_details',
    'insumos_return_notes','insumos_requested_at','insumos_resolved_at','insumos_resolved_by',
    'reproducao','letra_caixa','archived','archived_at','archived_by'
  ];
  v_forbidden text[];
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Patch inválido.' using errcode = '22023';
  end if;

  select array_agg(key)
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
    art_status = case when p_patch ? 'art_status' then nullif(trim(coalesce(p_patch->>'art_status', '')), '') else o.art_status end,
    prod_status = case when p_patch ? 'prod_status' then nullif(trim(coalesce(p_patch->>'prod_status', '')), '') else o.prod_status end,
    production_tag = case when p_patch ? 'production_tag' then nullif(trim(coalesce(p_patch->>'production_tag', '')), '') else o.production_tag end,
    insumos_details = case when p_patch ? 'insumos_details' then nullif(trim(coalesce(p_patch->>'insumos_details', '')), '') else o.insumos_details end,
    insumos_return_notes = case when p_patch ? 'insumos_return_notes' then nullif(trim(coalesce(p_patch->>'insumos_return_notes', '')), '') else o.insumos_return_notes end,
    insumos_requested_at = case when p_patch ? 'insumos_requested_at' then nullif(trim(coalesce(p_patch->>'insumos_requested_at', '')), '')::timestamptz else o.insumos_requested_at end,
    insumos_resolved_at = case when p_patch ? 'insumos_resolved_at' then nullif(trim(coalesce(p_patch->>'insumos_resolved_at', '')), '')::timestamptz else o.insumos_resolved_at end,
    insumos_resolved_by = case when p_patch ? 'insumos_resolved_by' then nullif(trim(coalesce(p_patch->>'insumos_resolved_by', '')), '')::uuid else o.insumos_resolved_by end,
    reproducao = case when p_patch ? 'reproducao' then coalesce((p_patch->>'reproducao')::boolean, false) else o.reproducao end,
    letra_caixa = case when p_patch ? 'letra_caixa' then coalesce((p_patch->>'letra_caixa')::boolean, false) else o.letra_caixa end,
    archived = case when p_patch ? 'archived' then coalesce((p_patch->>'archived')::boolean, false) else o.archived end,
    archived_at = case when p_patch ? 'archived_at' then nullif(trim(coalesce(p_patch->>'archived_at', '')), '')::timestamptz else o.archived_at end,
    archived_by = case when p_patch ? 'archived_by' then nullif(trim(coalesce(p_patch->>'archived_by', '')), '')::uuid else o.archived_by end,
    updated_at = now(),
    updated_by = v_uid
  where o.id = p_os_id
  returning * into v_updated;

  if v_updated.id is null then
    raise exception 'OS não encontrada.' using errcode = 'P0002';
  end if;

  if p_event_type is not null then
    insert into public.os_orders_event (os_id, type, payload, created_by, created_at)
    values (
      p_os_id,
      p_event_type,
      coalesce(p_event_payload, '{}'::jsonb),
      v_uid,
      now()
    );
  end if;

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
begin
  return public.hub_os_update_order_secure(
    p_os_id,
    jsonb_build_object(
      'archived', true,
      'archived_at', now(),
      'archived_by', auth.uid()
    ),
    'archive',
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('reason', p_reason)
  );
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
  v_patch jsonb := '{}'::jsonb;
begin
  if p_next_art_status is not null then
    v_patch := v_patch || jsonb_build_object('art_status', p_next_art_status);
  end if;
  if p_next_prod_status is not null then
    v_patch := v_patch || jsonb_build_object('prod_status', p_next_prod_status);
  end if;

  return public.hub_os_update_order_secure(
    p_os_id,
    v_patch,
    'status_change',
    coalesce(p_event_payload, '{}'::jsonb)
  );
end;
$$;

create or replace function public.hub_os_delete_order_secure(
  p_os_id uuid,
  p_reason text default 'delete',
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.hub_os_assert_orders_access();
  v_role text;
  v_existing public.os_orders;
begin
  select role into v_role from public.profiles where id = v_uid;
  if v_role not in ('admin', 'gerente') then
    raise exception 'Apenas gerente/admin podem excluir OS.' using errcode = '42501';
  end if;

  select * into v_existing from public.os_orders where id = p_os_id;
  if v_existing.id is null then
    raise exception 'OS não encontrada.' using errcode = 'P0002';
  end if;

  insert into public.os_orders_event (os_id, type, payload, created_by, created_at)
  values (
    p_os_id,
    'delete',
    coalesce(p_payload, '{}'::jsonb)
      || jsonb_build_object('reason', p_reason)
      || jsonb_build_object(
        'previous',
        jsonb_build_object(
          'id', v_existing.id,
          'sale_number', v_existing.sale_number,
          'client_name', v_existing.client_name,
          'title', v_existing.title,
          'art_status', v_existing.art_status,
          'prod_status', v_existing.prod_status
        )
      ),
    v_uid,
    now()
  );

  delete from public.os_orders where id = p_os_id;
end;
$$;

grant execute on function public.hub_os_create_order_secure(jsonb, text, jsonb) to authenticated;
grant execute on function public.hub_os_update_order_secure(uuid, jsonb, text, jsonb) to authenticated;
grant execute on function public.hub_os_archive_order_secure(uuid, text, jsonb) to authenticated;
grant execute on function public.hub_os_move_order_secure(uuid, text, text, jsonb) to authenticated;
grant execute on function public.hub_os_delete_order_secure(uuid, text, jsonb) to authenticated;

create index if not exists os_orders_archived_updated_idx
  on public.os_orders (archived, updated_at desc);

create index if not exists os_orders_event_os_created_idx
  on public.os_orders_event (os_id, created_at desc);
