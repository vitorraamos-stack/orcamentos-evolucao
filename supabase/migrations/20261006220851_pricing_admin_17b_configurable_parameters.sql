-- 17B configurable technical Costing parameters and commercial installation settings.
-- Server-only administration. Current pilot values are seeded only when LETREIRO_PVC exists.

create table public.product_costing_parameters (
  product_id uuid not null references public.products(id) on delete restrict,
  key text not null,
  label text not null,
  description text,
  value numeric not null,
  unit text,
  min_value numeric,
  max_value numeric,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  primary key (product_id, key),
  constraint product_costing_parameters_key_format check (key ~ '^[a-z][a-z0-9_]*$'),
  constraint product_costing_parameters_label_not_blank check (btrim(label) <> ''),
  constraint product_costing_parameters_unit_valid check (
    unit is null or unit in (
      'mm','cm','m','m2','linear_m','un','sheet','g','kg','min','h','BRL'
    )
  ),
  constraint product_costing_parameters_value_finite check (
    value::text not in ('NaN','Infinity','-Infinity')
  ),
  constraint product_costing_parameters_min_finite check (
    min_value is null or min_value::text not in ('NaN','Infinity','-Infinity')
  ),
  constraint product_costing_parameters_max_finite check (
    max_value is null or max_value::text not in ('NaN','Infinity','-Infinity')
  ),
  constraint product_costing_parameters_scale check (
    scale(value) <= 500
    and (min_value is null or scale(min_value) <= 500)
    and (max_value is null or scale(max_value) <= 500)
  ),
  constraint product_costing_parameters_range_valid check (
    (min_value is null or value >= min_value)
    and (max_value is null or value <= max_value)
    and (min_value is null or max_value is null or min_value <= max_value)
  ),
  constraint product_costing_parameters_revision_positive check (revision > 0)
);

create table public.costing_configuration_audit_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  parameter_key text not null,
  action text not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  before_state jsonb,
  after_state jsonb,
  constraint costing_configuration_audit_parameter_key_not_blank
    check (btrim(parameter_key) <> ''),
  constraint costing_configuration_audit_action_not_blank
    check (btrim(action) <> '')
);

create index costing_configuration_audit_entity_idx
  on public.costing_configuration_audit_events(
    product_id, parameter_key, occurred_at desc
  );

create table public.pricing_installation_settings (
  id smallint primary key default 1,
  tier_1_max_area_m2 numeric not null,
  tier_1_price numeric not null,
  tier_2_max_area_m2 numeric not null,
  tier_2_price numeric not null,
  tier_3_price numeric not null,
  munck_hourly_price numeric not null,
  munck_minimum_hours numeric not null,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  constraint pricing_installation_settings_singleton check (id = 1),
  constraint pricing_installation_settings_tiers_valid check (
    tier_1_max_area_m2 > 0
    and tier_2_max_area_m2 > tier_1_max_area_m2
  ),
  constraint pricing_installation_settings_prices_nonnegative check (
    tier_1_price >= 0
    and tier_2_price >= 0
    and tier_3_price >= 0
    and munck_hourly_price >= 0
  ),
  constraint pricing_installation_settings_munck_hours_positive check (
    munck_minimum_hours > 0
  ),
  constraint pricing_installation_settings_finite check (
    tier_1_max_area_m2::text not in ('NaN','Infinity','-Infinity')
    and tier_1_price::text not in ('NaN','Infinity','-Infinity')
    and tier_2_max_area_m2::text not in ('NaN','Infinity','-Infinity')
    and tier_2_price::text not in ('NaN','Infinity','-Infinity')
    and tier_3_price::text not in ('NaN','Infinity','-Infinity')
    and munck_hourly_price::text not in ('NaN','Infinity','-Infinity')
    and munck_minimum_hours::text not in ('NaN','Infinity','-Infinity')
  ),
  constraint pricing_installation_settings_revision_positive check (revision > 0)
);

alter table public.product_costing_parameters enable row level security;
alter table public.costing_configuration_audit_events enable row level security;
alter table public.pricing_installation_settings enable row level security;

comment on table public.product_costing_parameters is
  'Server-managed technical inputs injected into official Costing calculations.';
comment on table public.costing_configuration_audit_events is
  'Append-only audit of server-managed product Costing parameter changes.';
comment on table public.pricing_installation_settings is
  'Global commercial installation and munck settings for Quote orchestration.';

create function public.costing_guard_product_parameter()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.revision <> 1 then
      raise exception 'COSTING_PARAMETER_REVISION_CONFLICT';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'COSTING_PARAMETER_STATE_CONFLICT';
  end if;

  if new.product_id is distinct from old.product_id
    or new.key is distinct from old.key
    or new.label is distinct from old.label
    or new.description is distinct from old.description
    or new.unit is distinct from old.unit
    or new.min_value is distinct from old.min_value
    or new.max_value is distinct from old.max_value then
    raise exception 'COSTING_PARAMETER_STATE_CONFLICT';
  end if;

  if new.revision <> old.revision + 1 then
    raise exception 'COSTING_PARAMETER_REVISION_CONFLICT';
  end if;

  return new;
end;
$$;

create trigger product_costing_parameters_guard
before insert or update or delete on public.product_costing_parameters
for each row execute function public.costing_guard_product_parameter();

create function public.costing_guard_configuration_audit_event()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  raise exception 'COSTING_CONFIGURATION_AUDIT_APPEND_ONLY';
end;
$$;

create trigger costing_configuration_audit_events_append_only
before update or delete on public.costing_configuration_audit_events
for each row execute function public.costing_guard_configuration_audit_event();

create function public.pricing_guard_installation_settings()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.id <> 1 or new.revision <> 1 then
      raise exception 'PRICING_REVISION_CONFLICT';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' or new.id is distinct from old.id then
    raise exception 'PRICING_STATE_CONFLICT';
  end if;

  if new.revision <> old.revision + 1 then
    raise exception 'PRICING_REVISION_CONFLICT';
  end if;

  return new;
end;
$$;

create trigger pricing_installation_settings_guard
before insert or update or delete on public.pricing_installation_settings
for each row execute function public.pricing_guard_installation_settings();

create function public.costing_get_product_parameters_secure(p_product_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_id', p.product_id,
        'key', p.key,
        'label', p.label,
        'description', p.description,
        'value', p.value::text,
        'unit', p.unit,
        'min_value', case when p.min_value is null then null else p.min_value::text end,
        'max_value', case when p.max_value is null then null else p.max_value::text end,
        'revision', p.revision,
        'updated_at', p.updated_at,
        'updated_by', p.updated_by
      )
      order by p.key
    ),
    '[]'::jsonb
  )
  from public.product_costing_parameters p
  where p.product_id = p_product_id;
$$;

create function public.costing_upsert_product_parameter_secure(
  p_product_id uuid,
  p_key text,
  p_label text,
  p_description text,
  p_value numeric,
  p_unit text,
  p_min_value numeric,
  p_max_value numeric,
  p_expected_revision integer,
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_before public.product_costing_parameters;
  v_after public.product_costing_parameters;
begin
  if p_key !~ '^[a-z][a-z0-9_]*$'
    or btrim(p_label) = ''
    or p_value::text in ('NaN','Infinity','-Infinity')
    or (p_min_value is not null and p_min_value::text in ('NaN','Infinity','-Infinity'))
    or (p_max_value is not null and p_max_value::text in ('NaN','Infinity','-Infinity'))
    or (p_min_value is not null and p_value < p_min_value)
    or (p_max_value is not null and p_value > p_max_value)
    or (p_min_value is not null and p_max_value is not null and p_min_value > p_max_value)
    or (p_unit is not null and p_unit not in (
      'mm','cm','m','m2','linear_m','un','sheet','g','kg','min','h','BRL'
    )) then
    raise exception 'INVALID_COSTING_PARAMETER';
  end if;

  perform 1 from public.products where id = p_product_id;
  if not found then raise exception 'COSTING_PRODUCT_NOT_FOUND'; end if;

  select * into v_before
  from public.product_costing_parameters
  where product_id = p_product_id and key = p_key
  for update;

  if not found then
    if p_expected_revision is not null then
      raise exception 'COSTING_PARAMETER_REVISION_CONFLICT';
    end if;

    insert into public.product_costing_parameters(
      product_id,key,label,description,value,unit,min_value,max_value,revision,updated_by
    ) values (
      p_product_id,p_key,p_label,p_description,p_value,p_unit,p_min_value,p_max_value,1,p_actor_id
    )
    returning * into v_after;

    insert into public.costing_configuration_audit_events(
      product_id, parameter_key, action, actor_id, before_state, after_state
    ) values (
      p_product_id, p_key, 'CREATE_PRODUCT_PARAMETER', p_actor_id, null,
      to_jsonb(v_after)
    );
  else
    if p_expected_revision is null or v_before.revision <> p_expected_revision then
      raise exception 'COSTING_PARAMETER_REVISION_CONFLICT';
    end if;
    if v_before.label is distinct from p_label
      or v_before.description is distinct from p_description
      or v_before.unit is distinct from p_unit
      or v_before.min_value is distinct from p_min_value
      or v_before.max_value is distinct from p_max_value then
      raise exception 'COSTING_PARAMETER_STATE_CONFLICT';
    end if;

    update public.product_costing_parameters
    set value = p_value,
        revision = revision + 1,
        updated_at = now(),
        updated_by = p_actor_id
    where product_id = p_product_id and key = p_key
    returning * into v_after;

    insert into public.costing_configuration_audit_events(
      product_id, parameter_key, action, actor_id, before_state, after_state
    ) values (
      p_product_id, p_key, 'SET_PRODUCT_PARAMETER', p_actor_id,
      to_jsonb(v_before), to_jsonb(v_after)
    );
  end if;

  return jsonb_build_object(
    'product_id', v_after.product_id,
    'key', v_after.key,
    'label', v_after.label,
    'description', v_after.description,
    'value', v_after.value::text,
    'unit', v_after.unit,
    'min_value', case when v_after.min_value is null then null else v_after.min_value::text end,
    'max_value', case when v_after.max_value is null then null else v_after.max_value::text end,
    'revision', v_after.revision,
    'updated_at', v_after.updated_at,
    'updated_by', v_after.updated_by
  );
end;
$$;

create function public.pricing_get_installation_settings_secure()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'tier_1_max_area_m2', s.tier_1_max_area_m2::text,
    'tier_1_price', s.tier_1_price::text,
    'tier_2_max_area_m2', s.tier_2_max_area_m2::text,
    'tier_2_price', s.tier_2_price::text,
    'tier_3_price', s.tier_3_price::text,
    'munck_hourly_price', s.munck_hourly_price::text,
    'munck_minimum_hours', s.munck_minimum_hours::text,
    'revision', s.revision,
    'updated_at', s.updated_at,
    'updated_by', s.updated_by
  )
  from public.pricing_installation_settings s
  where s.id = 1;
$$;

create function public.pricing_set_installation_settings_secure(
  p_tier_1_max_area_m2 numeric,
  p_tier_1_price numeric,
  p_tier_2_max_area_m2 numeric,
  p_tier_2_price numeric,
  p_tier_3_price numeric,
  p_munck_hourly_price numeric,
  p_munck_minimum_hours numeric,
  p_expected_revision integer,
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_before public.pricing_installation_settings;
  v_after public.pricing_installation_settings;
begin
  if p_tier_1_max_area_m2 <= 0
    or p_tier_2_max_area_m2 <= p_tier_1_max_area_m2
    or p_tier_1_price < 0
    or p_tier_2_price < 0
    or p_tier_3_price < 0
    or p_munck_hourly_price < 0
    or p_munck_minimum_hours <= 0
    or p_tier_1_max_area_m2::text in ('NaN','Infinity','-Infinity')
    or p_tier_1_price::text in ('NaN','Infinity','-Infinity')
    or p_tier_2_max_area_m2::text in ('NaN','Infinity','-Infinity')
    or p_tier_2_price::text in ('NaN','Infinity','-Infinity')
    or p_tier_3_price::text in ('NaN','Infinity','-Infinity')
    or p_munck_hourly_price::text in ('NaN','Infinity','-Infinity')
    or p_munck_minimum_hours::text in ('NaN','Infinity','-Infinity') then
    raise exception 'INVALID_PRICING_CONFIGURATION';
  end if;

  select * into v_before
  from public.pricing_installation_settings
  where id = 1
  for update;

  if not found then
    if p_expected_revision is not null then
      raise exception 'PRICING_REVISION_CONFLICT';
    end if;

    insert into public.pricing_installation_settings(
      id,tier_1_max_area_m2,tier_1_price,tier_2_max_area_m2,tier_2_price,
      tier_3_price,munck_hourly_price,munck_minimum_hours,revision,updated_by
    ) values (
      1,p_tier_1_max_area_m2,p_tier_1_price,p_tier_2_max_area_m2,p_tier_2_price,
      p_tier_3_price,p_munck_hourly_price,p_munck_minimum_hours,1,p_actor_id
    )
    returning * into v_after;

    insert into public.pricing_audit_events(
      entity_type, entity_key, action, actor_id, before_state, after_state
    ) values (
      'INSTALLATION_SETTINGS', 'GLOBAL', 'CREATE_INSTALLATION_SETTINGS', p_actor_id,
      null, to_jsonb(v_after)
    );
  else
    if p_expected_revision is null or v_before.revision <> p_expected_revision then
      raise exception 'PRICING_REVISION_CONFLICT';
    end if;

    update public.pricing_installation_settings
    set tier_1_max_area_m2 = p_tier_1_max_area_m2,
        tier_1_price = p_tier_1_price,
        tier_2_max_area_m2 = p_tier_2_max_area_m2,
        tier_2_price = p_tier_2_price,
        tier_3_price = p_tier_3_price,
        munck_hourly_price = p_munck_hourly_price,
        munck_minimum_hours = p_munck_minimum_hours,
        revision = revision + 1,
        updated_at = now(),
        updated_by = p_actor_id
    where id = 1
    returning * into v_after;

    insert into public.pricing_audit_events(
      entity_type, entity_key, action, actor_id, before_state, after_state
    ) values (
      'INSTALLATION_SETTINGS', 'GLOBAL', 'SET_INSTALLATION_SETTINGS', p_actor_id,
      to_jsonb(v_before), to_jsonb(v_after)
    );
  end if;

  return public.pricing_get_installation_settings_secure();
end;
$$;

revoke all on table
  public.product_costing_parameters,
  public.costing_configuration_audit_events,
  public.pricing_installation_settings
from public, anon, authenticated, service_role;

grant select, insert, update on table public.product_costing_parameters to service_role;
grant select, insert on table public.costing_configuration_audit_events to service_role;
grant select, insert, update on table public.pricing_installation_settings to service_role;

revoke execute on function public.costing_get_product_parameters_secure(uuid)
  from public, anon, authenticated;
revoke execute on function public.costing_upsert_product_parameter_secure(uuid,text,text,text,numeric,text,numeric,numeric,integer,uuid)
  from public, anon, authenticated;
revoke execute on function public.pricing_get_installation_settings_secure()
  from public, anon, authenticated;
revoke execute on function public.pricing_set_installation_settings_secure(
  numeric,numeric,numeric,numeric,numeric,numeric,numeric,integer,uuid
) from public, anon, authenticated;

grant execute on function public.costing_get_product_parameters_secure(uuid)
  to service_role;
grant execute on function public.costing_upsert_product_parameter_secure(uuid,text,text,text,numeric,text,numeric,numeric,integer,uuid)
  to service_role;
grant execute on function public.pricing_get_installation_settings_secure()
  to service_role;
grant execute on function public.pricing_set_installation_settings_secure(
  numeric,numeric,numeric,numeric,numeric,numeric,numeric,integer,uuid
) to service_role;


-- Business values are intentionally not seeded here.
-- They are created after migration through the audited server-only RPCs so this
-- migration remains valid for fresh databases where the pilot product does not yet exist.
