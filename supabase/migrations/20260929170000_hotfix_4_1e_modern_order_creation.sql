-- Hotfix 4.1e: independent urgency and atomic operational items.
alter table public.os_orders add column if not exists is_urgent boolean not null default false;
update public.os_orders set is_urgent = true where art_direction_tag = 'URGENTE' and not is_urgent;

create or replace function public.hub_os_create_order_secure(
  p_payload jsonb,
  p_event_type text default 'create',
  p_event_payload jsonb default '{}'::jsonb
)
returns public.os_orders
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.hub_os_assert_orders_access();
  v_role text; v_inserted public.os_orders; v_item jsonb; v_item_id uuid;
  v_sale_number text := nullif(trim(coalesce(p_payload->>'sale_number', '')), '');
  v_client_name text := nullif(trim(coalesce(p_payload->>'client_name', '')), '');
  v_items jsonb := coalesce(p_payload->'items', '[]'::jsonb);
  v_item_count integer := 0; v_position integer := 0;
  v_is_draft boolean := coalesce((p_payload->>'is_draft')::boolean, false);
  v_art_direction text := nullif(trim(coalesce(p_payload->>'art_direction_tag', '')), '');
begin
  select case p.role when 'admin' then 'gerente' when 'consultor' then 'consultor_vendas' else p.role end
    into v_role from public.profiles p where p.id = v_uid;
  if v_role is null or v_role not in ('gerente', 'consultor_vendas') then
    raise exception 'Somente gerente ou consultor de vendas pode criar OS.' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Payload inválido.' using errcode = '22023'; end if;
  if v_sale_number is null or v_client_name is null then raise exception 'sale_number e client_name são obrigatórios.' using errcode = '22023'; end if;
  if p_payload ? 'items' and jsonb_typeof(p_payload->'items') <> 'array' then raise exception 'items deve ser um array.' using errcode = '22023'; end if;
  -- Historical callers without `items` remain compatible. New clients that send it must send a valid item for a definitive creation.
  if p_payload ? 'items' and not v_is_draft and jsonb_array_length(v_items) = 0 then raise exception 'A OS deve possuir ao menos um item.' using errcode = '22023'; end if;
  if (p_payload ? 'items' and not v_is_draft and (v_art_direction is null or v_art_direction not in ('ARTE_PRONTA_EDICAO','CRIACAO_ARTE')))
     or (v_art_direction is not null and v_art_direction not in ('ARTE_PRONTA_EDICAO','CRIACAO_ARTE')) then
    raise exception 'Direcionamento de arte inválido para uma nova OS.' using errcode = '22023';
  end if;

  insert into public.os_orders (sale_number,client_name,title,description,delivery_date,delivery_deadline_preset,delivery_deadline_started_at,logistic_type,address,art_direction_tag,is_urgent,production_tag,insumos_details,insumos_return_notes,insumos_requested_at,insumos_resolved_at,insumos_resolved_by,art_status,prod_status,reproducao,letra_caixa,archived,archived_at,archived_by,created_by,updated_by,created_at,updated_at)
  values (v_sale_number,v_client_name,nullif(trim(coalesce(p_payload->>'title','')),''),nullif(trim(coalesce(p_payload->>'description','')),''),nullif(trim(coalesce(p_payload->>'delivery_date','')),'')::date,nullif(trim(coalesce(p_payload->>'delivery_deadline_preset','')),''),nullif(trim(coalesce(p_payload->>'delivery_deadline_started_at','')),'')::timestamptz,coalesce(nullif(trim(coalesce(p_payload->>'logistic_type','')),''),'retirada'),nullif(trim(coalesce(p_payload->>'address','')),''),v_art_direction,coalesce((p_payload->>'is_urgent')::boolean,false),nullif(trim(coalesce(p_payload->>'production_tag','')),''),nullif(trim(coalesce(p_payload->>'insumos_details','')),''),nullif(trim(coalesce(p_payload->>'insumos_return_notes','')),''),nullif(trim(coalesce(p_payload->>'insumos_requested_at','')),'')::timestamptz,nullif(trim(coalesce(p_payload->>'insumos_resolved_at','')),'')::timestamptz,nullif(trim(coalesce(p_payload->>'insumos_resolved_by','')),'')::uuid,'Caixa de Entrada',null,coalesce((p_payload->>'reproducao')::boolean,false),coalesce((p_payload->>'letra_caixa')::boolean,false),false,null,null,v_uid,v_uid,now(),now()) returning * into v_inserted;

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_position := v_position + 1;
    if nullif(trim(coalesce(v_item->>'name','')),'') is null or length(trim(v_item->>'name')) > 160 then raise exception 'Nome do item inválido na posição %.', v_position using errcode='22023'; end if;
    if nullif(trim(coalesce(v_item->>'unit','')),'') is null or length(trim(v_item->>'unit')) > 30 then raise exception 'Unidade do item inválida na posição %.', v_position using errcode='22023'; end if;
    if length(coalesce(v_item->>'description','')) > 4000 or length(coalesce(v_item->>'notes','')) > 4000 then raise exception 'Texto do item excede o limite na posição %.', v_position using errcode='22023'; end if;
    if coalesce((v_item->>'quantity')::numeric,0) <= 0 then raise exception 'Quantidade do item inválida na posição %.', v_position using errcode='22023'; end if;
    if v_item->>'width_cm' is not null and (v_item->>'width_cm')::numeric <= 0 then raise exception 'Largura do item inválida na posição %.', v_position using errcode='22023'; end if;
    if v_item->>'height_cm' is not null and (v_item->>'height_cm')::numeric <= 0 then raise exception 'Altura do item inválida na posição %.', v_position using errcode='22023'; end if;
    insert into public.os_order_items(order_id,name,description,quantity,width_cm,height_cm,unit,notes,status,sort_order,created_by)
    values(v_inserted.id,trim(v_item->>'name'),nullif(trim(coalesce(v_item->>'description','')),''),(v_item->>'quantity')::numeric,nullif(v_item->>'width_cm','')::numeric,nullif(v_item->>'height_cm','')::numeric,trim(v_item->>'unit'),nullif(trim(coalesce(v_item->>'notes','')),''),'PENDING',v_position-1,v_uid)
    returning id into v_item_id;
    insert into public.os_orders_event(os_id,type,payload,created_by,created_at) values(v_inserted.id,'item_created',jsonb_build_object('item_id',v_item_id,'name',trim(v_item->>'name'),'source','create_order'),v_uid,now());
    v_item_count := v_item_count + 1;
  end loop;
  if p_event_type is not null then
    insert into public.os_orders_event(os_id,type,payload,created_by,created_at) values(v_inserted.id,p_event_type,(coalesce(p_event_payload,'{}'::jsonb)-'actor') || jsonb_build_object('item_count',v_item_count,'is_urgent',v_inserted.is_urgent,'art_direction_tag',v_inserted.art_direction_tag,'logistic_type',v_inserted.logistic_type),v_uid,now());
  end if;
  return v_inserted;
end; $$;

-- Managerial editing can change priority independently from art direction.
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
    'insumos_requested_at','insumos_resolved_at','insumos_resolved_by','reproducao','letra_caixa','is_urgent'
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
    is_urgent = case when p_patch ? 'is_urgent' then coalesce((p_patch->>'is_urgent')::boolean, false) else o.is_urgent end,
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

revoke insert on table public.os_orders from authenticated, anon;
revoke execute on function public.hub_os_create_order_secure(jsonb,text,jsonb) from public, anon;
grant execute on function public.hub_os_create_order_secure(jsonb,text,jsonb) to authenticated;
revoke execute on function public.hub_os_update_order_secure(uuid,jsonb,text,jsonb) from public, anon;
grant execute on function public.hub_os_update_order_secure(uuid,jsonb,text,jsonb) to authenticated;
