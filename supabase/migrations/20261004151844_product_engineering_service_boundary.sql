-- Internal transactional boundary for Product Engineering. This migration is intentionally PR-only.

create function public.product_engineering_create_product_secure(
  p_code text, p_name text, p_description text, p_actor_id uuid,
  p_schema_version text, p_expression_ast_version text
) returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_product public.products; v_version public.product_versions;
begin
  insert into public.products(code,name,description) values(p_code,p_name,p_description) returning * into v_product;
  insert into public.product_versions(product_id,version_number,status,revision,schema_version,expression_ast_version,created_by)
  values(v_product.id,1,'DRAFT',1,p_schema_version,p_expression_ast_version,p_actor_id) returning * into v_version;
  return jsonb_build_object('product_id',v_product.id,'version_id',v_version.id,'revision',v_version.revision);
end; $$;

create function public.product_engineering_get_version_definition_secure(p_version_id uuid)
returns jsonb language sql stable security invoker set search_path = pg_catalog, public as $$
  select jsonb_build_object(
    'schema_version',v.schema_version,'expression_ast_version',v.expression_ast_version,
    'version',to_jsonb(v) - 'schema_version' - 'expression_ast_version',
    'inputs',coalesce((select jsonb_agg(
      (to_jsonb(i) - 'product_version_id' - 'decimal_default' - 'decimal_min' - 'decimal_max') ||
      jsonb_build_object('decimal_default',i.decimal_default::text,'decimal_min',i.decimal_min::text,'decimal_max',i.decimal_max::text)
      order by i.sort_order,i.id) from public.product_inputs i where i.product_version_id=v.id),'[]'::jsonb),
    'variables',coalesce((select jsonb_agg(to_jsonb(x)-'product_version_id' order by x.sort_order,x.id) from public.product_variables x where x.product_version_id=v.id),'[]'::jsonb),
    'components',coalesce((select jsonb_agg(to_jsonb(c)-'product_version_id' order by c.sort_order,c.id) from public.product_components c where c.product_version_id=v.id),'[]'::jsonb)
  ) from public.product_versions v where v.id=p_version_id;
$$;

create function public.product_engineering_save_draft_secure(
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
    insert into public.product_inputs(id,product_version_id,key,label,description,type,required,sort_order,unit,decimal_default,decimal_min,decimal_max,boolean_default,select_options,select_default,text_default,text_max_length)
    values((item->>'id')::uuid,p_version_id,item->>'key',item->>'label',item->>'description',item->>'type',coalesce((item->>'required')::boolean,false),(item->>'sort_order')::integer,item->>'unit',
      (item->>'decimal_default')::numeric,(item->>'decimal_min')::numeric,(item->>'decimal_max')::numeric,(item->>'boolean_default')::boolean,nullif(item->'select_options','null'::jsonb),item->>'select_default',item->>'text_default',(item->>'text_max_length')::integer);
  end loop;
  for item in select value from jsonb_array_elements(p_variables) loop
    insert into public.product_variables(id,product_version_id,key,label,expression,sort_order,expected_value_type,expected_unit,enforce_expected_unit)
    values((item->>'id')::uuid,p_version_id,item->>'key',item->>'label',item->'expression',(item->>'sort_order')::integer,item->>'expected_value_type',item->>'expected_unit',coalesce((item->>'enforce_expected_unit')::boolean,false));
  end loop;
  for item in select value from jsonb_array_elements(p_components) loop
    insert into public.product_components(id,product_version_id,component_type,material_id,process_definition_id,outsourced_service_id,fixed_cost_definition_id,label,sort_order,quantity_scope,condition_expression,quantity_expression,quantity_unit)
    values((item->>'id')::uuid,p_version_id,item->>'component_type',(item->>'material_id')::uuid,(item->>'process_definition_id')::uuid,(item->>'outsourced_service_id')::uuid,(item->>'fixed_cost_definition_id')::uuid,item->>'label',(item->>'sort_order')::integer,item->>'quantity_scope',nullif(item->'condition_expression','null'::jsonb),item->'quantity_expression',item->>'quantity_unit');
  end loop;
  update public.product_versions set notes=p_notes,revision=revision+1 where id=p_version_id returning revision into v_revision;
  return v_revision;
end; $$;

create function public.product_engineering_transition_version_secure(p_version_id uuid,p_expected_revision integer,p_target_status text)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v public.product_versions;
begin
 select * into v from public.product_versions where id=p_version_id for update;
 if not found then raise exception 'version not found'; end if;
 if v.revision<>p_expected_revision then raise exception 'revision conflict'; end if;
 if not ((v.status='DRAFT' and p_target_status='VALIDATING') or (v.status='VALIDATING' and p_target_status='DRAFT')) then raise exception 'invalid lifecycle transition'; end if;
 update public.product_versions set status=p_target_status where id=p_version_id returning * into v;
 return to_jsonb(v);
end; $$;

create function public.product_engineering_publish_version_secure(p_version_id uuid,p_expected_revision integer,p_expected_current_published_version_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_target public.product_versions; v_current uuid; v_product uuid;
begin
 select * into v_target from public.product_versions where id=p_version_id for update;
 if not found then raise exception 'version not found'; end if;
 if v_target.status<>'VALIDATING' then raise exception 'target status conflict: expected VALIDATING'; end if;
 if v_target.revision<>p_expected_revision then raise exception 'revision conflict'; end if;
 v_product:=v_target.product_id;
 perform id from public.products where id=v_product for update;
 select id into v_current from public.product_versions where product_id=v_product and status='PUBLISHED';
 if v_current is distinct from p_expected_current_published_version_id then raise exception 'current published version changed'; end if;
 if v_current is not null then update public.product_versions set status='RETIRED' where id=v_current; end if;
 update public.product_versions set status='PUBLISHED',published_at=now(),published_by=p_actor_id where id=p_version_id returning * into v_target;
 return to_jsonb(v_target);
end; $$;

revoke execute on function public.product_engineering_create_product_secure(text,text,text,uuid,text,text) from public, anon, authenticated;
revoke execute on function public.product_engineering_get_version_definition_secure(uuid) from public, anon, authenticated;
revoke execute on function public.product_engineering_save_draft_secure(uuid,integer,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke execute on function public.product_engineering_transition_version_secure(uuid,integer,text) from public, anon, authenticated;
revoke execute on function public.product_engineering_publish_version_secure(uuid,integer,uuid,uuid) from public, anon, authenticated;
grant execute on function public.product_engineering_create_product_secure(text,text,text,uuid,text,text) to service_role;
grant execute on function public.product_engineering_get_version_definition_secure(uuid) to service_role;
grant execute on function public.product_engineering_save_draft_secure(uuid,integer,text,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.product_engineering_transition_version_secure(uuid,integer,text) to service_role;
grant execute on function public.product_engineering_publish_version_secure(uuid,integer,uuid,uuid) to service_role;
