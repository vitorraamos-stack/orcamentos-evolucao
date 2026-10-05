-- Costing persistence foundation. This catalogue is intentionally isolated
-- from the legacy public.materials and public.price_tiers calculator tables.

create table public.material_definitions (
  id uuid primary key default gen_random_uuid(), code text not null, name text not null,
  description text not null default '', status text not null default 'ACTIVE', cost_unit text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  constraint material_definitions_code_format check (code ~ '^[A-Z][A-Z0-9_]*$'),
  constraint material_definitions_name_not_blank check (btrim(name) <> ''),
  constraint material_definitions_status_valid check (status in ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  constraint material_definitions_cost_unit_valid check (cost_unit in ('mm','cm','m','m2','linear_m','un','sheet','g','kg','min','h')),
  constraint material_definitions_code_unique unique (code),
  constraint material_definitions_id_cost_unit_unique unique (id, cost_unit)
);

create table public.process_definitions (
  id uuid primary key default gen_random_uuid(), code text not null, name text not null,
  description text not null default '', status text not null default 'ACTIVE', cost_unit text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  constraint process_definitions_code_format check (code ~ '^[A-Z][A-Z0-9_]*$'),
  constraint process_definitions_name_not_blank check (btrim(name) <> ''),
  constraint process_definitions_status_valid check (status in ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  constraint process_definitions_cost_unit_valid check (cost_unit in ('mm','cm','m','m2','linear_m','un','sheet','g','kg','min','h')),
  constraint process_definitions_code_unique unique (code),
  constraint process_definitions_id_cost_unit_unique unique (id, cost_unit)
);

create table public.outsourced_service_definitions (
  id uuid primary key default gen_random_uuid(), code text not null, name text not null,
  description text not null default '', status text not null default 'ACTIVE', cost_unit text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  constraint outsourced_service_definitions_code_format check (code ~ '^[A-Z][A-Z0-9_]*$'),
  constraint outsourced_service_definitions_name_not_blank check (btrim(name) <> ''),
  constraint outsourced_service_definitions_status_valid check (status in ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  constraint outsourced_service_definitions_cost_unit_valid check (cost_unit in ('mm','cm','m','m2','linear_m','un','sheet','g','kg','min','h')),
  constraint outsourced_service_definitions_code_unique unique (code),
  constraint outsourced_service_definitions_id_cost_unit_unique unique (id, cost_unit)
);

create table public.fixed_cost_definitions (
  id uuid primary key default gen_random_uuid(), code text not null, name text not null,
  description text not null default '', status text not null default 'ACTIVE', cost_unit text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  constraint fixed_cost_definitions_code_format check (code ~ '^[A-Z][A-Z0-9_]*$'),
  constraint fixed_cost_definitions_name_not_blank check (btrim(name) <> ''),
  constraint fixed_cost_definitions_status_valid check (status in ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  constraint fixed_cost_definitions_cost_unit_valid check (cost_unit in ('mm','cm','m','m2','linear_m','un','sheet','g','kg','min','h')),
  constraint fixed_cost_definitions_code_unique unique (code),
  constraint fixed_cost_definitions_id_cost_unit_unique unique (id, cost_unit)
);

create table public.material_cost_rates (
  id uuid primary key default gen_random_uuid(), material_id uuid not null, amount numeric not null,
  currency text not null default 'BRL', unit text not null, effective_from timestamptz not null,
  effective_to timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  constraint material_cost_rates_amount_nonnegative check (amount >= 0),
  constraint material_cost_rates_currency_brl check (currency = 'BRL'),
  constraint material_cost_rates_unit_valid check (unit in ('mm','cm','m','m2','linear_m','un','sheet','g','kg','min','h')),
  constraint material_cost_rates_interval_valid check (effective_to is null or effective_to > effective_from),
  constraint material_cost_rates_resource_unit_fk foreign key (material_id, unit) references public.material_definitions(id, cost_unit) on delete restrict,
  constraint material_cost_rates_start_unique unique (material_id, effective_from)
);

create table public.process_cost_rates (
  id uuid primary key default gen_random_uuid(), process_definition_id uuid not null, amount numeric not null,
  currency text not null default 'BRL', unit text not null, effective_from timestamptz not null,
  effective_to timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  constraint process_cost_rates_amount_nonnegative check (amount >= 0), constraint process_cost_rates_currency_brl check (currency = 'BRL'),
  constraint process_cost_rates_unit_valid check (unit in ('mm','cm','m','m2','linear_m','un','sheet','g','kg','min','h')),
  constraint process_cost_rates_interval_valid check (effective_to is null or effective_to > effective_from),
  constraint process_cost_rates_resource_unit_fk foreign key (process_definition_id, unit) references public.process_definitions(id, cost_unit) on delete restrict,
  constraint process_cost_rates_start_unique unique (process_definition_id, effective_from)
);

create table public.outsourced_service_cost_rates (
  id uuid primary key default gen_random_uuid(), outsourced_service_id uuid not null, amount numeric not null,
  currency text not null default 'BRL', unit text not null, effective_from timestamptz not null,
  effective_to timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  constraint outsourced_service_cost_rates_amount_nonnegative check (amount >= 0), constraint outsourced_service_cost_rates_currency_brl check (currency = 'BRL'),
  constraint outsourced_service_cost_rates_unit_valid check (unit in ('mm','cm','m','m2','linear_m','un','sheet','g','kg','min','h')),
  constraint outsourced_service_cost_rates_interval_valid check (effective_to is null or effective_to > effective_from),
  constraint outsourced_service_cost_rates_resource_unit_fk foreign key (outsourced_service_id, unit) references public.outsourced_service_definitions(id, cost_unit) on delete restrict,
  constraint outsourced_service_cost_rates_start_unique unique (outsourced_service_id, effective_from)
);

create table public.fixed_cost_rates (
  id uuid primary key default gen_random_uuid(), fixed_cost_definition_id uuid not null, amount numeric not null,
  currency text not null default 'BRL', unit text not null, effective_from timestamptz not null,
  effective_to timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  constraint fixed_cost_rates_amount_nonnegative check (amount >= 0), constraint fixed_cost_rates_currency_brl check (currency = 'BRL'),
  constraint fixed_cost_rates_unit_valid check (unit in ('mm','cm','m','m2','linear_m','un','sheet','g','kg','min','h')),
  constraint fixed_cost_rates_interval_valid check (effective_to is null or effective_to > effective_from),
  constraint fixed_cost_rates_resource_unit_fk foreign key (fixed_cost_definition_id, unit) references public.fixed_cost_definitions(id, cost_unit) on delete restrict,
  constraint fixed_cost_rates_start_unique unique (fixed_cost_definition_id, effective_from)
);

create unique index material_cost_rates_one_open_idx on public.material_cost_rates(material_id) where effective_to is null;
create unique index process_cost_rates_one_open_idx on public.process_cost_rates(process_definition_id) where effective_to is null;
create unique index outsourced_service_cost_rates_one_open_idx on public.outsourced_service_cost_rates(outsourced_service_id) where effective_to is null;
create unique index fixed_cost_rates_one_open_idx on public.fixed_cost_rates(fixed_cost_definition_id) where effective_to is null;

create function public.costing_touch_updated_at() returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $$ begin new.updated_at := now(); return new; end; $$;
create function public.costing_prevent_resource_delete() returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $$ begin raise exception 'Costing resources must be archived instead of deleted'; end; $$;
create function public.costing_prevent_rate_delete() returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $$ begin raise exception 'Historical cost rates cannot be deleted'; end; $$;

create trigger material_definitions_touch_updated_at before update on public.material_definitions for each row execute function public.costing_touch_updated_at();
create trigger process_definitions_touch_updated_at before update on public.process_definitions for each row execute function public.costing_touch_updated_at();
create trigger outsourced_service_definitions_touch_updated_at before update on public.outsourced_service_definitions for each row execute function public.costing_touch_updated_at();
create trigger fixed_cost_definitions_touch_updated_at before update on public.fixed_cost_definitions for each row execute function public.costing_touch_updated_at();
create trigger material_definitions_prevent_delete before delete on public.material_definitions for each row execute function public.costing_prevent_resource_delete();
create trigger process_definitions_prevent_delete before delete on public.process_definitions for each row execute function public.costing_prevent_resource_delete();
create trigger outsourced_service_definitions_prevent_delete before delete on public.outsourced_service_definitions for each row execute function public.costing_prevent_resource_delete();
create trigger fixed_cost_definitions_prevent_delete before delete on public.fixed_cost_definitions for each row execute function public.costing_prevent_resource_delete();

create function public.costing_guard_material_cost_rate() returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.material_id is distinct from old.material_id or new.amount is distinct from old.amount
      or new.currency is distinct from old.currency or new.unit is distinct from old.unit or new.effective_from is distinct from old.effective_from
      or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by then
      raise exception 'Historical material cost rate fields are immutable';
    end if;
    if new.effective_to is distinct from old.effective_to and not (old.effective_to is null and new.effective_to is not null) then
      raise exception 'A material cost rate may only transition from open to closed once';
    end if;
  end if;
  perform id from public.material_definitions where id = new.material_id for update;
  if exists (select 1 from public.material_cost_rates r where r.material_id = new.material_id and r.id <> new.id
    and tstzrange(r.effective_from, coalesce(r.effective_to, 'infinity'::timestamptz), '[)') &&
        tstzrange(new.effective_from, coalesce(new.effective_to, 'infinity'::timestamptz), '[)')) then
    raise exception 'Material cost rate intervals cannot overlap';
  end if;
  return new;
end; $$;

create function public.costing_guard_process_cost_rate() returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.process_definition_id is distinct from old.process_definition_id or new.amount is distinct from old.amount
      or new.currency is distinct from old.currency or new.unit is distinct from old.unit or new.effective_from is distinct from old.effective_from
      or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by then raise exception 'Historical process cost rate fields are immutable'; end if;
    if new.effective_to is distinct from old.effective_to and not (old.effective_to is null and new.effective_to is not null) then raise exception 'A process cost rate may only transition from open to closed once'; end if;
  end if;
  perform id from public.process_definitions where id = new.process_definition_id for update;
  if exists (select 1 from public.process_cost_rates r where r.process_definition_id = new.process_definition_id and r.id <> new.id and
    tstzrange(r.effective_from, coalesce(r.effective_to, 'infinity'::timestamptz), '[)') && tstzrange(new.effective_from, coalesce(new.effective_to, 'infinity'::timestamptz), '[)')) then raise exception 'Process cost rate intervals cannot overlap'; end if;
  return new;
end; $$;

create function public.costing_guard_outsourced_service_cost_rate() returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.outsourced_service_id is distinct from old.outsourced_service_id or new.amount is distinct from old.amount
      or new.currency is distinct from old.currency or new.unit is distinct from old.unit or new.effective_from is distinct from old.effective_from
      or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by then raise exception 'Historical outsourced service cost rate fields are immutable'; end if;
    if new.effective_to is distinct from old.effective_to and not (old.effective_to is null and new.effective_to is not null) then raise exception 'An outsourced service cost rate may only transition from open to closed once'; end if;
  end if;
  perform id from public.outsourced_service_definitions where id = new.outsourced_service_id for update;
  if exists (select 1 from public.outsourced_service_cost_rates r where r.outsourced_service_id = new.outsourced_service_id and r.id <> new.id and
    tstzrange(r.effective_from, coalesce(r.effective_to, 'infinity'::timestamptz), '[)') && tstzrange(new.effective_from, coalesce(new.effective_to, 'infinity'::timestamptz), '[)')) then raise exception 'Outsourced service cost rate intervals cannot overlap'; end if;
  return new;
end; $$;

create function public.costing_guard_fixed_cost_rate() returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.fixed_cost_definition_id is distinct from old.fixed_cost_definition_id or new.amount is distinct from old.amount
      or new.currency is distinct from old.currency or new.unit is distinct from old.unit or new.effective_from is distinct from old.effective_from
      or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by then raise exception 'Historical fixed cost rate fields are immutable'; end if;
    if new.effective_to is distinct from old.effective_to and not (old.effective_to is null and new.effective_to is not null) then raise exception 'A fixed cost rate may only transition from open to closed once'; end if;
  end if;
  perform id from public.fixed_cost_definitions where id = new.fixed_cost_definition_id for update;
  if exists (select 1 from public.fixed_cost_rates r where r.fixed_cost_definition_id = new.fixed_cost_definition_id and r.id <> new.id and
    tstzrange(r.effective_from, coalesce(r.effective_to, 'infinity'::timestamptz), '[)') && tstzrange(new.effective_from, coalesce(new.effective_to, 'infinity'::timestamptz), '[)')) then raise exception 'Fixed cost rate intervals cannot overlap'; end if;
  return new;
end; $$;

create trigger material_cost_rates_guard before insert or update on public.material_cost_rates for each row execute function public.costing_guard_material_cost_rate();
create trigger process_cost_rates_guard before insert or update on public.process_cost_rates for each row execute function public.costing_guard_process_cost_rate();
create trigger outsourced_service_cost_rates_guard before insert or update on public.outsourced_service_cost_rates for each row execute function public.costing_guard_outsourced_service_cost_rate();
create trigger fixed_cost_rates_guard before insert or update on public.fixed_cost_rates for each row execute function public.costing_guard_fixed_cost_rate();
create trigger material_cost_rates_touch_updated_at before update on public.material_cost_rates for each row execute function public.costing_touch_updated_at();
create trigger process_cost_rates_touch_updated_at before update on public.process_cost_rates for each row execute function public.costing_touch_updated_at();
create trigger outsourced_service_cost_rates_touch_updated_at before update on public.outsourced_service_cost_rates for each row execute function public.costing_touch_updated_at();
create trigger fixed_cost_rates_touch_updated_at before update on public.fixed_cost_rates for each row execute function public.costing_touch_updated_at();
create trigger material_cost_rates_prevent_delete before delete on public.material_cost_rates for each row execute function public.costing_prevent_rate_delete();
create trigger process_cost_rates_prevent_delete before delete on public.process_cost_rates for each row execute function public.costing_prevent_rate_delete();
create trigger outsourced_service_cost_rates_prevent_delete before delete on public.outsourced_service_cost_rates for each row execute function public.costing_prevent_rate_delete();
create trigger fixed_cost_rates_prevent_delete before delete on public.fixed_cost_rates for each row execute function public.costing_prevent_rate_delete();

alter table public.product_components add constraint product_components_material_costing_fk foreign key (material_id) references public.material_definitions(id) on delete restrict;
alter table public.product_components add constraint product_components_process_costing_fk foreign key (process_definition_id) references public.process_definitions(id) on delete restrict;
alter table public.product_components add constraint product_components_outsourced_service_costing_fk foreign key (outsourced_service_id) references public.outsourced_service_definitions(id) on delete restrict;
alter table public.product_components add constraint product_components_fixed_cost_costing_fk foreign key (fixed_cost_definition_id) references public.fixed_cost_definitions(id) on delete restrict;
create index product_components_material_costing_idx on public.product_components(material_id) where material_id is not null;
create index product_components_process_costing_idx on public.product_components(process_definition_id) where process_definition_id is not null;
create index product_components_outsourced_service_costing_idx on public.product_components(outsourced_service_id) where outsourced_service_id is not null;
create index product_components_fixed_cost_costing_idx on public.product_components(fixed_cost_definition_id) where fixed_cost_definition_id is not null;

comment on table public.material_definitions is 'Costing material catalogue; separate from legacy materials.';
comment on table public.process_definitions is 'Costing process catalogue.';
comment on table public.outsourced_service_definitions is 'Costing outsourced service catalogue.';
comment on table public.fixed_cost_definitions is 'Costing fixed cost catalogue.';
comment on table public.material_cost_rates is 'Temporal cost rates using [effective_from, effective_to).';
comment on table public.process_cost_rates is 'Temporal cost rates using [effective_from, effective_to).';
comment on table public.outsourced_service_cost_rates is 'Temporal cost rates using [effective_from, effective_to).';
comment on table public.fixed_cost_rates is 'Temporal cost rates using [effective_from, effective_to).';
comment on column public.product_components.material_id is 'References Costing material definition, not legacy materials.';

alter table public.material_definitions enable row level security;
alter table public.process_definitions enable row level security;
alter table public.outsourced_service_definitions enable row level security;
alter table public.fixed_cost_definitions enable row level security;
alter table public.material_cost_rates enable row level security;
alter table public.process_cost_rates enable row level security;
alter table public.outsourced_service_cost_rates enable row level security;
alter table public.fixed_cost_rates enable row level security;

revoke all on table public.material_definitions, public.process_definitions, public.outsourced_service_definitions, public.fixed_cost_definitions,
  public.material_cost_rates, public.process_cost_rates, public.outsourced_service_cost_rates, public.fixed_cost_rates from public, anon, authenticated;
grant select, insert, update on table public.material_definitions, public.process_definitions, public.outsourced_service_definitions, public.fixed_cost_definitions,
  public.material_cost_rates, public.process_cost_rates, public.outsourced_service_cost_rates, public.fixed_cost_rates to service_role;
revoke execute on function public.costing_touch_updated_at(), public.costing_prevent_resource_delete(), public.costing_prevent_rate_delete(),
  public.costing_guard_material_cost_rate(), public.costing_guard_process_cost_rate(), public.costing_guard_outsourced_service_cost_rate(), public.costing_guard_fixed_cost_rate()
  from public, anon, authenticated;
