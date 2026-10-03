-- Product Engineering persistence foundation.
-- Products are sellable definitions and deliberately do not reference the
-- legacy materials catalogue. Resource references remain unbound UUIDs until
-- their own bounded contexts provide stable contracts.

create table public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_code_format check (code ~ '^[A-Z][A-Z0-9_]*$'),
  constraint products_name_not_blank check (btrim(name) <> ''),
  constraint products_status_valid check (status in ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  constraint products_code_unique unique (code)
);

create table public.product_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  version_number integer not null,
  status text not null default 'DRAFT',
  revision integer not null default 1,
  schema_version text not null default '1.0',
  expression_ast_version text not null default '1.0',
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete restrict,
  constraint product_versions_version_positive check (version_number > 0),
  constraint product_versions_revision_positive check (revision > 0),
  constraint product_versions_schema_version_supported check (schema_version = '1.0'),
  constraint product_versions_expression_ast_version_supported check (
    expression_ast_version = '1.0'
  ),
  constraint product_versions_status_valid check (
    status in ('DRAFT', 'VALIDATING', 'PUBLISHED', 'RETIRED')
  ),
  constraint product_versions_publication_metadata_consistent check (
    (status in ('DRAFT', 'VALIDATING') and published_at is null and published_by is null)
    or
    (status in ('PUBLISHED', 'RETIRED') and published_at is not null and published_by is not null)
  ),
  constraint product_versions_product_version_unique unique (product_id, version_number)
);

create unique index product_versions_one_published_per_product_idx
  on public.product_versions (product_id)
  where status = 'PUBLISHED';

create index product_versions_product_id_idx
  on public.product_versions (product_id);

create index products_status_idx
  on public.products (status);

create index product_versions_status_idx
  on public.product_versions (status);

create table public.product_inputs (
  id uuid primary key default gen_random_uuid(),
  product_version_id uuid not null references public.product_versions(id) on delete restrict,
  key text not null,
  label text not null,
  description text,
  type text not null,
  required boolean not null default false,
  sort_order integer not null default 0,
  unit text,
  decimal_default numeric,
  decimal_min numeric,
  decimal_max numeric,
  boolean_default boolean,
  select_options jsonb,
  select_default text,
  text_default text,
  text_max_length integer,
  constraint product_inputs_key_format check (key ~ '^[a-z][a-z0-9_]*$'),
  constraint product_inputs_label_not_blank check (btrim(label) <> ''),
  constraint product_inputs_type_valid check (type in ('DECIMAL', 'BOOLEAN', 'SELECT', 'TEXT')),
  constraint product_inputs_unit_valid check (
    unit is null or unit in (
      'mm', 'cm', 'm', 'm2', 'linear_m', 'un', 'sheet', 'g', 'kg', 'min', 'h', 'BRL'
    )
  ),
  constraint product_inputs_sort_order_nonnegative check (sort_order >= 0),
  constraint product_inputs_decimal_range check (
    decimal_min is null or decimal_max is null or decimal_min <= decimal_max
  ),
  constraint product_inputs_decimal_default_range check (
    decimal_default is null
    or ((decimal_min is null or decimal_default >= decimal_min)
      and (decimal_max is null or decimal_default <= decimal_max))
  ),
  constraint product_inputs_text_max_length_positive check (
    text_max_length is null or text_max_length > 0
  ),
  constraint product_inputs_select_options_array check (
    select_options is null or jsonb_typeof(select_options) = 'array'
  ),
  constraint product_inputs_type_payload check (
    (type = 'DECIMAL' and boolean_default is null and select_options is null
      and select_default is null and text_default is null and text_max_length is null)
    or
    (type = 'BOOLEAN' and unit is null and decimal_default is null and decimal_min is null
      and decimal_max is null and select_options is null and select_default is null
      and text_default is null and text_max_length is null)
    or
    (type = 'SELECT' and unit is null and decimal_default is null and decimal_min is null
      and decimal_max is null and boolean_default is null and select_options is not null
      and case when jsonb_typeof(select_options) = 'array'
        then jsonb_array_length(select_options) > 0 else false end
      and text_default is null
      and text_max_length is null)
    or
    (type = 'TEXT' and unit is null and decimal_default is null and decimal_min is null
      and decimal_max is null and boolean_default is null and select_options is null
      and select_default is null)
  ),
  constraint product_inputs_version_key_unique unique (product_version_id, key)
);

create index product_inputs_version_order_idx
  on public.product_inputs (product_version_id, sort_order, id);

create table public.product_variables (
  id uuid primary key default gen_random_uuid(),
  product_version_id uuid not null references public.product_versions(id) on delete restrict,
  key text not null,
  label text not null,
  expression jsonb not null,
  sort_order integer not null default 0,
  expected_value_type text,
  expected_unit text,
  enforce_expected_unit boolean not null default false,
  constraint product_variables_key_format check (key ~ '^[a-z][a-z0-9_]*$'),
  constraint product_variables_label_not_blank check (btrim(label) <> ''),
  constraint product_variables_expression_object check (jsonb_typeof(expression) = 'object'),
  constraint product_variables_sort_order_nonnegative check (sort_order >= 0),
  constraint product_variables_expected_type_valid check (
    expected_value_type is null or expected_value_type in ('DECIMAL', 'BOOLEAN', 'STRING')
  ),
  constraint product_variables_expected_unit_semantics check (
    (enforce_expected_unit and expected_value_type = 'DECIMAL')
    or (not enforce_expected_unit and expected_unit is null)
  ),
  constraint product_variables_expected_unit_valid check (
    expected_unit is null or expected_unit in (
      'mm', 'cm', 'm', 'm2', 'linear_m', 'un', 'sheet', 'g', 'kg', 'min', 'h', 'BRL'
    )
  ),
  constraint product_variables_version_key_unique unique (product_version_id, key)
);

create index product_variables_version_order_idx
  on public.product_variables (product_version_id, sort_order, id);

create table public.product_components (
  id uuid primary key default gen_random_uuid(),
  product_version_id uuid not null references public.product_versions(id) on delete restrict,
  component_type text not null,
  material_id uuid,
  process_definition_id uuid,
  outsourced_service_id uuid,
  fixed_cost_definition_id uuid,
  label text not null,
  sort_order integer not null default 0,
  quantity_scope text not null,
  condition_expression jsonb,
  quantity_expression jsonb not null,
  quantity_unit text not null,
  constraint product_components_type_valid check (
    component_type in ('MATERIAL', 'PROCESS', 'OUTSOURCED_SERVICE', 'FIXED_COST')
  ),
  constraint product_components_resource_reference_check check (
    (component_type = 'MATERIAL' and material_id is not null
      and process_definition_id is null and outsourced_service_id is null
      and fixed_cost_definition_id is null)
    or
    (component_type = 'PROCESS' and material_id is null
      and process_definition_id is not null and outsourced_service_id is null
      and fixed_cost_definition_id is null)
    or
    (component_type = 'OUTSOURCED_SERVICE' and material_id is null
      and process_definition_id is null and outsourced_service_id is not null
      and fixed_cost_definition_id is null)
    or
    (component_type = 'FIXED_COST' and material_id is null
      and process_definition_id is null and outsourced_service_id is null
      and fixed_cost_definition_id is not null)
  ),
  constraint product_components_label_not_blank check (btrim(label) <> ''),
  constraint product_components_sort_order_nonnegative check (sort_order >= 0),
  constraint product_components_quantity_scope_valid check (
    quantity_scope in ('PER_UNIT', 'PER_QUOTE_ITEM')
  ),
  constraint product_components_condition_object check (
    condition_expression is null or jsonb_typeof(condition_expression) = 'object'
  ),
  constraint product_components_quantity_object check (
    jsonb_typeof(quantity_expression) = 'object'
  ),
  constraint product_components_quantity_unit_valid check (
    quantity_unit in (
      'mm', 'cm', 'm', 'm2', 'linear_m', 'un', 'sheet', 'g', 'kg', 'min', 'h', 'BRL'
    )
  )
);

create index product_components_version_order_idx
  on public.product_components (product_version_id, sort_order, id);

create index product_components_type_idx
  on public.product_components (component_type);

comment on table public.products is 'Sellable product catalogue.';
comment on table public.product_versions is 'Versioned product engineering definitions.';
comment on table public.product_inputs is 'Typed inputs for a product version.';
comment on table public.product_variables is 'Calculated variables for a product version.';
comment on table public.product_components is 'Typed resource components for a product version.';
comment on column public.product_versions.revision is
  'Optimistic locking revision for an editable draft.';
comment on column public.product_variables.enforce_expected_unit is
  'Distinguishes no unit expectation from an expected scalar decimal.';
comment on column public.product_components.quantity_scope is
  'Determines whether quantity applies per unit or per quote item.';

create function public.product_engineering_touch_product_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger products_touch_updated_at
before update on public.products
for each row execute function public.product_engineering_touch_product_updated_at();

create function public.product_engineering_prevent_product_delete()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Products must be archived instead of deleted';
  return old;
end;
$$;

create trigger products_prevent_delete
before delete on public.products
for each row execute function public.product_engineering_prevent_product_delete();

create function public.product_engineering_guard_version()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'DRAFT' or new.revision <> 1
      or new.published_at is not null or new.published_by is not null then
      raise exception 'A product version must be created as DRAFT at revision 1';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'DRAFT' then
      raise exception '% product versions cannot be deleted', old.status;
    end if;
    return old;
  end if;

  if new.id is distinct from old.id
    or new.product_id is distinct from old.product_id
    or new.version_number is distinct from old.version_number
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'Product version identity and authorship are immutable';
  end if;

  if old.status = 'DRAFT' then
    if new.status not in ('DRAFT', 'VALIDATING') then
      raise exception 'Invalid product version transition from DRAFT to %', new.status;
    end if;
    if new.status = 'DRAFT' and new.revision <> old.revision + 1 then
      raise exception 'Editing a DRAFT must increment revision by exactly one';
    end if;
    if new.status = 'VALIDATING' and (
      new.revision <> old.revision
      or new.schema_version is distinct from old.schema_version
      or new.expression_ast_version is distinct from old.expression_ast_version
      or new.notes is distinct from old.notes
      or new.published_at is distinct from old.published_at
      or new.published_by is distinct from old.published_by
    ) then
      raise exception 'Entering VALIDATING may only change lifecycle fields';
    end if;
  elsif old.status = 'VALIDATING' then
    if new.status not in ('DRAFT', 'PUBLISHED') then
      raise exception 'Invalid product version transition from VALIDATING to %', new.status;
    end if;
    if new.revision <> old.revision
      or new.schema_version is distinct from old.schema_version
      or new.expression_ast_version is distinct from old.expression_ast_version
      or new.notes is distinct from old.notes then
      raise exception 'VALIDATING product versions are frozen';
    end if;
  elsif old.status = 'PUBLISHED' then
    if new.status <> 'RETIRED' then
      raise exception 'PUBLISHED product versions may only be retired';
    end if;
    if new.revision <> old.revision
      or new.schema_version is distinct from old.schema_version
      or new.expression_ast_version is distinct from old.expression_ast_version
      or new.notes is distinct from old.notes
      or new.published_at is distinct from old.published_at
      or new.published_by is distinct from old.published_by then
      raise exception 'Published engineering is immutable';
    end if;
  else
    raise exception 'RETIRED product versions are immutable';
  end if;

  return new;
end;
$$;

create trigger product_versions_guard
before insert or update or delete on public.product_versions
for each row execute function public.product_engineering_guard_version();

create function public.product_engineering_guard_draft_child()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  target_version_id uuid;
  parent_status text;
begin
  target_version_id := case when tg_op = 'DELETE'
    then old.product_version_id else new.product_version_id end;

  select status
  into parent_status
  from public.product_versions
  where id = target_version_id
  for update;

  if not found then
    raise exception 'Parent product version does not exist';
  end if;

  if parent_status <> 'DRAFT' then
    raise exception 'Product engineering children are mutable only in DRAFT';
  end if;

  if tg_op = 'UPDATE' and new.product_version_id is distinct from old.product_version_id then
    raise exception 'A product engineering child cannot move between versions';
  end if;

  if tg_op <> 'DELETE' and tg_table_name = 'product_inputs' and exists (
    select 1 from public.product_variables
    where product_version_id = new.product_version_id and key = new.key
  ) then
    raise exception 'Input and variable keys share one namespace';
  end if;

  if tg_op <> 'DELETE' and tg_table_name = 'product_variables' and exists (
    select 1 from public.product_inputs
    where product_version_id = new.product_version_id and key = new.key
  ) then
    raise exception 'Input and variable keys share one namespace';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger product_inputs_guard_draft
before insert or update or delete on public.product_inputs
for each row execute function public.product_engineering_guard_draft_child();

create trigger product_variables_guard_draft
before insert or update or delete on public.product_variables
for each row execute function public.product_engineering_guard_draft_child();

create trigger product_components_guard_draft
before insert or update or delete on public.product_components
for each row execute function public.product_engineering_guard_draft_child();

alter table public.products enable row level security;
alter table public.product_versions enable row level security;
alter table public.product_inputs enable row level security;
alter table public.product_variables enable row level security;
alter table public.product_components enable row level security;

create policy products_manager_select on public.products
for select to authenticated
using (public.is_manager((select auth.uid())));

create policy products_manager_insert on public.products
for insert to authenticated
with check (public.is_manager((select auth.uid())));

create policy products_manager_update on public.products
for update to authenticated
using (public.is_manager((select auth.uid())))
with check (public.is_manager((select auth.uid())));

create policy product_versions_manager_all on public.product_versions
for all to authenticated
using (public.is_manager(auth.uid()))
with check (public.is_manager(auth.uid()));

create policy product_inputs_manager_all on public.product_inputs
for all to authenticated
using (public.is_manager(auth.uid()))
with check (public.is_manager(auth.uid()));

create policy product_variables_manager_all on public.product_variables
for all to authenticated
using (public.is_manager(auth.uid()))
with check (public.is_manager(auth.uid()));

create policy product_components_manager_all on public.product_components
for all to authenticated
using (public.is_manager(auth.uid()))
with check (public.is_manager(auth.uid()));

revoke all on table public.products from anon;
revoke all on table public.product_versions from anon;
revoke all on table public.product_inputs from anon;
revoke all on table public.product_variables from anon;
revoke all on table public.product_components from anon;

grant select, insert, update on table public.products to authenticated;
grant select, insert, update, delete on table public.product_versions to authenticated;
grant select, insert, update, delete on table public.product_inputs to authenticated;
grant select, insert, update, delete on table public.product_variables to authenticated;
grant select, insert, update, delete on table public.product_components to authenticated;
