-- Clone the current published engineering definition into a new editable version.
-- A PL/pgSQL function invocation is atomic: any failed clone rolls back the
-- version and every child inserted by this statement.
create function public.product_engineering_create_version_secure(
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
  -- Resolve only the lock key first; all authoritative source checks happen
  -- again after the per-product serialization lock has been acquired.
  select product_id
    into v_product_id
    from public.product_versions
   where id = p_source_version_id;
  if not found then
    raise exception 'source version not found';
  end if;

  perform id
    from public.products
   where id = v_product_id
   for update;
  if not found then
    raise exception 'product not found';
  end if;

  select *
    into v_source
    from public.product_versions
   where id = p_source_version_id
     and product_id = v_product_id;
  if not found then
    raise exception 'source version not found';
  end if;
  if v_source.status <> 'PUBLISHED' then
    raise exception 'source status conflict: expected PUBLISHED';
  end if;
  if v_source.revision <> p_expected_revision then
    raise exception 'revision conflict';
  end if;

  select coalesce(max(version_number), 0) + 1
    into v_version_number
    from public.product_versions
   where product_id = v_product_id;

  begin
    insert into public.product_versions (
      product_id, version_number, status, revision, schema_version,
      expression_ast_version, notes, created_by, published_at, published_by
    ) values (
      v_source.product_id, v_version_number, 'DRAFT', 1,
      v_source.schema_version, v_source.expression_ast_version,
      v_source.notes, p_actor_id, null, null
    ) returning * into v_version;
  exception when unique_violation then
    raise exception 'version number conflict';
  end;

  -- IDs are intentionally omitted so every clone receives the table's UUID default.
  -- Numeric values remain numeric throughout this DB-to-DB copy.
  insert into public.product_inputs (
    product_version_id, key, label, description, type, required, sort_order,
    unit, decimal_default, decimal_min, decimal_max, boolean_default,
    select_options, select_default, text_default, text_max_length
  )
  select v_version.id, key, label, description, type, required, sort_order,
         unit, decimal_default, decimal_min, decimal_max, boolean_default,
         select_options, select_default, text_default, text_max_length
    from public.product_inputs
   where product_version_id = v_source.id;

  insert into public.product_variables (
    product_version_id, key, label, expression, sort_order,
    expected_value_type, expected_unit, enforce_expected_unit
  )
  select v_version.id, key, label, expression, sort_order,
         expected_value_type, expected_unit, enforce_expected_unit
    from public.product_variables
   where product_version_id = v_source.id;

  insert into public.product_components (
    product_version_id, component_type, material_id, process_definition_id,
    outsourced_service_id, fixed_cost_definition_id, label, sort_order,
    quantity_scope, condition_expression, quantity_expression, quantity_unit
  )
  select v_version.id, component_type, material_id, process_definition_id,
         outsourced_service_id, fixed_cost_definition_id, label, sort_order,
         quantity_scope, condition_expression, quantity_expression, quantity_unit
    from public.product_components
   where product_version_id = v_source.id;

  return jsonb_build_object(
    'product_id', v_source.product_id,
    'source_version_id', v_source.id,
    'version_id', v_version.id,
    'version_number', v_version.version_number,
    'revision', v_version.revision
  );
end;
$$;

revoke execute on function public.product_engineering_create_version_secure(uuid, integer, uuid) from public;
revoke execute on function public.product_engineering_create_version_secure(uuid, integer, uuid) from anon;
revoke execute on function public.product_engineering_create_version_secure(uuid, integer, uuid) from authenticated;
grant execute on function public.product_engineering_create_version_secure(uuid, integer, uuid) to service_role;
