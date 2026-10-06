-- 17B.1 proposal: persisted manager-only Product Engineering inputs.
-- This file is a review artifact. It is not a migration until the controlled
-- production application assigns the canonical Supabase migration timestamp.

alter table public.product_inputs
  add column input_scope text not null default 'REQUEST';

alter table public.product_inputs
  add constraint product_inputs_scope_valid
  check (input_scope in ('REQUEST', 'CONFIGURATION'));

alter table public.product_inputs
  add constraint product_inputs_configuration_default
  check (
    input_scope = 'REQUEST'
    or (
      not required
      and (
        (type = 'DECIMAL' and decimal_default is not null)
        or (type = 'BOOLEAN' and boolean_default is not null)
        or (type = 'SELECT' and select_default is not null)
        or (type = 'TEXT' and text_default is not null)
      )
    )
  );

comment on column public.product_inputs.input_scope is
  'REQUEST accepts caller input; CONFIGURATION is manager-controlled, resolved only from its persisted default.';

create or replace function public.product_engineering_save_draft_secure(
  p_version_id uuid, p_expected_revision integer, p_notes text,
  p_inputs jsonb, p_variables jsonb, p_components jsonb
) returns integer language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v public.product_versions; item jsonb; v_revision integer;
begin
  select * into v from public.product_versions where id=p_version_id for update;
  if not found then raise exception 'version not found'; end if;
  if v.status <> 'DRAFT' then raise exception 'version status conflict: expected DRAFT'; end if;
  if v.revision <> p_expected_revision then raise exception 'revision conflict'; end if;
  delete from public.product_components where product_version_id=p_version_id;
  delete from public.product_variables where product_version_id=p_version_id;
  delete from public.product_inputs where product_version_id=p_version_id;
  for item in select value from jsonb_array_elements(p_inputs) loop
    insert into public.product_inputs(
      id,product_version_id,key,label,description,type,required,input_scope,sort_order,
      unit,decimal_default,decimal_min,decimal_max,boolean_default,select_options,
      select_default,text_default,text_max_length
    )
    values(
      (item->>'id')::uuid,p_version_id,item->>'key',item->>'label',item->>'description',
      item->>'type',coalesce((item->>'required')::boolean,false),
      coalesce(item->>'input_scope','REQUEST'),(item->>'sort_order')::integer,item->>'unit',
      (item->>'decimal_default')::numeric,(item->>'decimal_min')::numeric,
      (item->>'decimal_max')::numeric,(item->>'boolean_default')::boolean,
      nullif(item->'select_options','null'::jsonb),item->>'select_default',
      item->>'text_default',(item->>'text_max_length')::integer
    );
  end loop;
  for item in select value from jsonb_array_elements(p_variables) loop
    insert into public.product_variables(
      id,product_version_id,key,label,expression,sort_order,expected_value_type,
      expected_unit,enforce_expected_unit
    )
    values(
      (item->>'id')::uuid,p_version_id,item->>'key',item->>'label',item->'expression',
      (item->>'sort_order')::integer,item->>'expected_value_type',item->>'expected_unit',
      coalesce((item->>'enforce_expected_unit')::boolean,false)
    );
  end loop;
  for item in select value from jsonb_array_elements(p_components) loop
    insert into public.product_components(
      id,product_version_id,component_type,material_id,process_definition_id,
      outsourced_service_id,fixed_cost_definition_id,label,sort_order,quantity_scope,
      condition_expression,quantity_expression,quantity_unit
    )
    values(
      (item->>'id')::uuid,p_version_id,item->>'component_type',
      (item->>'material_id')::uuid,(item->>'process_definition_id')::uuid,
      (item->>'outsourced_service_id')::uuid,(item->>'fixed_cost_definition_id')::uuid,
      item->>'label',(item->>'sort_order')::integer,item->>'quantity_scope',
      nullif(item->'condition_expression','null'::jsonb),item->'quantity_expression',
      item->>'quantity_unit'
    );
  end loop;
  update public.product_versions
     set notes=p_notes,revision=revision+1
   where id=p_version_id
   returning revision into v_revision;
  return v_revision;
end; $$;

create or replace function public.product_engineering_create_version_secure(
  p_source_version_id uuid,
  p_expected_revision integer,
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_product_id uuid;
  v_source public.product_versions;
  v_version public.product_versions;
  v_version_number integer;
begin
  select product_id into v_product_id
    from public.product_versions
   where id = p_source_version_id;
  if not found then raise exception 'source version not found'; end if;

  perform id from public.products where id = v_product_id for update;
  if not found then raise exception 'product not found'; end if;

  select * into v_source
    from public.product_versions
   where id = p_source_version_id and product_id = v_product_id;
  if not found then raise exception 'source version not found'; end if;
  if v_source.status <> 'PUBLISHED' then
    raise exception 'source status conflict: expected PUBLISHED';
  end if;
  if v_source.revision <> p_expected_revision then
    raise exception 'revision conflict';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_version_number
    from public.product_versions
   where product_id = v_product_id;

  begin
    insert into public.product_versions(
      product_id,version_number,status,revision,schema_version,
      expression_ast_version,notes,created_by,published_at,published_by
    ) values (
      v_source.product_id,v_version_number,'DRAFT',1,
      v_source.schema_version,v_source.expression_ast_version,
      v_source.notes,p_actor_id,null,null
    ) returning * into v_version;
  exception when unique_violation then
    raise exception 'version number conflict';
  end;

  insert into public.product_inputs(
    product_version_id,key,label,description,type,required,input_scope,sort_order,
    unit,decimal_default,decimal_min,decimal_max,boolean_default,select_options,
    select_default,text_default,text_max_length
  )
  select v_version.id,key,label,description,type,required,input_scope,sort_order,
         unit,decimal_default,decimal_min,decimal_max,boolean_default,select_options,
         select_default,text_default,text_max_length
    from public.product_inputs
   where product_version_id = v_source.id;

  insert into public.product_variables(
    product_version_id,key,label,expression,sort_order,
    expected_value_type,expected_unit,enforce_expected_unit
  )
  select v_version.id,key,label,expression,sort_order,
         expected_value_type,expected_unit,enforce_expected_unit
    from public.product_variables
   where product_version_id = v_source.id;

  insert into public.product_components(
    product_version_id,component_type,material_id,process_definition_id,
    outsourced_service_id,fixed_cost_definition_id,label,sort_order,
    quantity_scope,condition_expression,quantity_expression,quantity_unit
  )
  select v_version.id,component_type,material_id,process_definition_id,
         outsourced_service_id,fixed_cost_definition_id,label,sort_order,
         quantity_scope,condition_expression,quantity_expression,quantity_unit
    from public.product_components
   where product_version_id = v_source.id;

  return jsonb_build_object(
    'product_id',v_source.product_id,
    'source_version_id',v_source.id,
    'version_id',v_version.id,
    'version_number',v_version.version_number,
    'revision',v_version.revision
  );
end;
$$;

revoke execute on function public.product_engineering_save_draft_secure(
  uuid,integer,text,jsonb,jsonb,jsonb
) from public, anon, authenticated;
revoke execute on function public.product_engineering_create_version_secure(
  uuid,integer,uuid
) from public, anon, authenticated;

grant execute on function public.product_engineering_save_draft_secure(
  uuid,integer,text,jsonb,jsonb,jsonb
) to service_role;
grant execute on function public.product_engineering_create_version_secure(
  uuid,integer,uuid
) to service_role;
