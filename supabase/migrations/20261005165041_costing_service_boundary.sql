-- Transactional, server-only Costing administration boundary.
create or replace function public.costing_create_resource_secure(
  p_type text, p_code text, p_name text, p_description text, p_cost_unit text, p_actor_id uuid
) returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare r record;
begin
  if p_type = 'MATERIAL' then
    insert into public.material_definitions(code,name,description,status,cost_unit,created_by,updated_by)
    values(p_code,p_name,p_description,'ACTIVE',p_cost_unit,p_actor_id,p_actor_id) returning * into r;
  elsif p_type = 'PROCESS' then
    insert into public.process_definitions(code,name,description,status,cost_unit,created_by,updated_by)
    values(p_code,p_name,p_description,'ACTIVE',p_cost_unit,p_actor_id,p_actor_id) returning * into r;
  elsif p_type = 'OUTSOURCED_SERVICE' then
    insert into public.outsourced_service_definitions(code,name,description,status,cost_unit,created_by,updated_by)
    values(p_code,p_name,p_description,'ACTIVE',p_cost_unit,p_actor_id,p_actor_id) returning * into r;
  elsif p_type = 'FIXED_COST' then
    insert into public.fixed_cost_definitions(code,name,description,status,cost_unit,created_by,updated_by)
    values(p_code,p_name,p_description,'ACTIVE',p_cost_unit,p_actor_id,p_actor_id) returning * into r;
  else raise exception 'INVALID_RESOURCE_TYPE'; end if;
  return jsonb_build_object('resource',jsonb_build_object('id',r.id,'type',p_type,'code',r.code,'name',r.name,'description',r.description,'status',r.status,'costUnit',r.cost_unit),'updatedAt',r.updated_at);
exception when unique_violation then raise exception 'RESOURCE_CODE_CONFLICT';
end; $$;

create or replace function public.costing_update_resource_secure(
  p_type text, p_resource_id uuid, p_code text, p_name text, p_description text, p_status text,
  p_cost_unit text, p_expected_updated_at timestamptz, p_actor_id uuid
) returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare r record;
begin
  if p_type = 'MATERIAL' then select * into r from public.material_definitions where id=p_resource_id for update;
  elsif p_type = 'PROCESS' then select * into r from public.process_definitions where id=p_resource_id for update;
  elsif p_type = 'OUTSOURCED_SERVICE' then select * into r from public.outsourced_service_definitions where id=p_resource_id for update;
  elsif p_type = 'FIXED_COST' then select * into r from public.fixed_cost_definitions where id=p_resource_id for update;
  else raise exception 'INVALID_RESOURCE_TYPE'; end if;
  if not found then raise exception 'RESOURCE_NOT_FOUND'; end if;
  if r.updated_at is distinct from p_expected_updated_at then raise exception 'RESOURCE_CONCURRENCY_CONFLICT'; end if;
  if p_type = 'MATERIAL' then update public.material_definitions set code=p_code,name=p_name,description=p_description,status=p_status,cost_unit=p_cost_unit,updated_by=p_actor_id where id=p_resource_id returning * into r;
  elsif p_type = 'PROCESS' then update public.process_definitions set code=p_code,name=p_name,description=p_description,status=p_status,cost_unit=p_cost_unit,updated_by=p_actor_id where id=p_resource_id returning * into r;
  elsif p_type = 'OUTSOURCED_SERVICE' then update public.outsourced_service_definitions set code=p_code,name=p_name,description=p_description,status=p_status,cost_unit=p_cost_unit,updated_by=p_actor_id where id=p_resource_id returning * into r;
  else update public.fixed_cost_definitions set code=p_code,name=p_name,description=p_description,status=p_status,cost_unit=p_cost_unit,updated_by=p_actor_id where id=p_resource_id returning * into r; end if;
  return jsonb_build_object('resource',jsonb_build_object('id',r.id,'type',p_type,'code',r.code,'name',r.name,'description',r.description,'status',r.status,'costUnit',r.cost_unit),'updatedAt',r.updated_at);
exception
  when unique_violation then raise exception 'RESOURCE_CODE_CONFLICT';
  when foreign_key_violation then raise exception 'COST_UNIT_IN_USE';
end; $$;

create or replace function public.costing_set_current_rate_secure(
  p_type text, p_resource_id uuid, p_amount numeric, p_effective_from timestamptz, p_actor_id uuid
) returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare resource_unit text; old_rate record; new_rate record; closed_id uuid;
begin
  if p_amount < 0 or p_effective_from is null then raise exception 'INVALID_COST_RATE'; end if;
  if p_type = 'MATERIAL' then
    select cost_unit into resource_unit from public.material_definitions where id=p_resource_id for update;
    if not found then raise exception 'RESOURCE_NOT_FOUND'; end if;
    select * into old_rate from public.material_cost_rates where material_id=p_resource_id and effective_to is null for update;
    if found and p_effective_from <= old_rate.effective_from then raise exception 'COST_RATE_EFFECTIVE_FROM_CONFLICT'; end if;
    if found then update public.material_cost_rates set effective_to=p_effective_from,updated_by=p_actor_id where id=old_rate.id; closed_id:=old_rate.id; end if;
    insert into public.material_cost_rates(material_id,amount,currency,unit,effective_from,created_by,updated_by) values(p_resource_id,p_amount,'BRL',resource_unit,p_effective_from,p_actor_id,p_actor_id) returning * into new_rate;
  elsif p_type = 'PROCESS' then
    select cost_unit into resource_unit from public.process_definitions where id=p_resource_id for update;
    if not found then raise exception 'RESOURCE_NOT_FOUND'; end if;
    select * into old_rate from public.process_cost_rates where process_definition_id=p_resource_id and effective_to is null for update;
    if found and p_effective_from <= old_rate.effective_from then raise exception 'COST_RATE_EFFECTIVE_FROM_CONFLICT'; end if;
    if found then update public.process_cost_rates set effective_to=p_effective_from,updated_by=p_actor_id where id=old_rate.id; closed_id:=old_rate.id; end if;
    insert into public.process_cost_rates(process_definition_id,amount,currency,unit,effective_from,created_by,updated_by) values(p_resource_id,p_amount,'BRL',resource_unit,p_effective_from,p_actor_id,p_actor_id) returning * into new_rate;
  elsif p_type = 'OUTSOURCED_SERVICE' then
    select cost_unit into resource_unit from public.outsourced_service_definitions where id=p_resource_id for update;
    if not found then raise exception 'RESOURCE_NOT_FOUND'; end if;
    select * into old_rate from public.outsourced_service_cost_rates where outsourced_service_id=p_resource_id and effective_to is null for update;
    if found and p_effective_from <= old_rate.effective_from then raise exception 'COST_RATE_EFFECTIVE_FROM_CONFLICT'; end if;
    if found then update public.outsourced_service_cost_rates set effective_to=p_effective_from,updated_by=p_actor_id where id=old_rate.id; closed_id:=old_rate.id; end if;
    insert into public.outsourced_service_cost_rates(outsourced_service_id,amount,currency,unit,effective_from,created_by,updated_by) values(p_resource_id,p_amount,'BRL',resource_unit,p_effective_from,p_actor_id,p_actor_id) returning * into new_rate;
  elsif p_type = 'FIXED_COST' then
    select cost_unit into resource_unit from public.fixed_cost_definitions where id=p_resource_id for update;
    if not found then raise exception 'RESOURCE_NOT_FOUND'; end if;
    select * into old_rate from public.fixed_cost_rates where fixed_cost_definition_id=p_resource_id and effective_to is null for update;
    if found and p_effective_from <= old_rate.effective_from then raise exception 'COST_RATE_EFFECTIVE_FROM_CONFLICT'; end if;
    if found then update public.fixed_cost_rates set effective_to=p_effective_from,updated_by=p_actor_id where id=old_rate.id; closed_id:=old_rate.id; end if;
    insert into public.fixed_cost_rates(fixed_cost_definition_id,amount,currency,unit,effective_from,created_by,updated_by) values(p_resource_id,p_amount,'BRL',resource_unit,p_effective_from,p_actor_id,p_actor_id) returning * into new_rate;
  else raise exception 'INVALID_RESOURCE_TYPE'; end if;
  return jsonb_build_object('rate',jsonb_build_object('id',new_rate.id,'type',p_type,
    case p_type when 'MATERIAL' then 'materialId' when 'PROCESS' then 'processDefinitionId' when 'OUTSOURCED_SERVICE' then 'outsourcedServiceId' else 'fixedCostDefinitionId' end,p_resource_id,
    'amount',new_rate.amount::text,'currency',new_rate.currency,'unit',new_rate.unit,'effectiveFrom',new_rate.effective_from,'effectiveTo',new_rate.effective_to),'closedRateId',closed_id);
exception when exclusion_violation or unique_violation then raise exception 'COST_RATE_OVERLAP';
end; $$;

create or replace function public.costing_get_rate_series_secure(p_type text,p_resource_id uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  if p_type='MATERIAL' then select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'type','MATERIAL','materialId',r.material_id,'amount',r.amount::text,'currency',r.currency,'unit',r.unit,'effectiveFrom',r.effective_from,'effectiveTo',r.effective_to) order by r.effective_from),'[]'::jsonb) into result from public.material_cost_rates r where r.material_id=p_resource_id;
  elsif p_type='PROCESS' then select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'type','PROCESS','processDefinitionId',r.process_definition_id,'amount',r.amount::text,'currency',r.currency,'unit',r.unit,'effectiveFrom',r.effective_from,'effectiveTo',r.effective_to) order by r.effective_from),'[]'::jsonb) into result from public.process_cost_rates r where r.process_definition_id=p_resource_id;
  elsif p_type='OUTSOURCED_SERVICE' then select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'type','OUTSOURCED_SERVICE','outsourcedServiceId',r.outsourced_service_id,'amount',r.amount::text,'currency',r.currency,'unit',r.unit,'effectiveFrom',r.effective_from,'effectiveTo',r.effective_to) order by r.effective_from),'[]'::jsonb) into result from public.outsourced_service_cost_rates r where r.outsourced_service_id=p_resource_id;
  elsif p_type='FIXED_COST' then select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'type','FIXED_COST','fixedCostDefinitionId',r.fixed_cost_definition_id,'amount',r.amount::text,'currency',r.currency,'unit',r.unit,'effectiveFrom',r.effective_from,'effectiveTo',r.effective_to) order by r.effective_from),'[]'::jsonb) into result from public.fixed_cost_rates r where r.fixed_cost_definition_id=p_resource_id;
  else raise exception 'INVALID_RESOURCE_TYPE'; end if;
  return result;
end; $$;

revoke execute on function public.costing_create_resource_secure(text,text,text,text,text,uuid), public.costing_update_resource_secure(text,uuid,text,text,text,text,text,timestamptz,uuid), public.costing_set_current_rate_secure(text,uuid,numeric,timestamptz,uuid), public.costing_get_rate_series_secure(text,uuid) from public, anon, authenticated;
grant execute on function public.costing_create_resource_secure(text,text,text,text,text,uuid), public.costing_update_resource_secure(text,uuid,text,text,text,text,text,timestamptz,uuid), public.costing_set_current_rate_secure(text,uuid,numeric,timestamptz,uuid), public.costing_get_rate_series_secure(text,uuid) to service_role;
