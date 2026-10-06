-- 16C.2 Pricing Persistence.
-- Server-only administration boundary. No commercial rates/markup/minimums are seeded here.

create table public.pricing_policies (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  status text not null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  constraint pricing_policies_code_format check (code ~ '^[A-Z][A-Z0-9_]*$'),
  constraint pricing_policies_name_not_blank check (btrim(name) <> ''),
  constraint pricing_policies_status_valid check (status in ('ACTIVE','INACTIVE','ARCHIVED')),
  constraint pricing_policies_revision_positive check (revision > 0),
  constraint pricing_policies_code_unique unique (code)
);

create table public.pricing_policy_versions (
  id uuid primary key default gen_random_uuid(),
  pricing_policy_id uuid not null references public.pricing_policies(id) on delete restrict,
  version_number integer not null,
  revision integer not null default 1,
  schema_version text not null,
  engine_version text not null,
  status text not null,
  strategy_type text not null,
  markup numeric not null,
  markup_base text not null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete restrict,
  constraint pricing_policy_versions_version_positive check (version_number > 0),
  constraint pricing_policy_versions_revision_positive check (revision > 0),
  constraint pricing_policy_versions_schema_supported check (schema_version = '1.0'),
  constraint pricing_policy_versions_engine_supported check (engine_version = '1.0'),
  constraint pricing_policy_versions_status_valid check (
    status in ('DRAFT','VALIDATING','PUBLISHED','RETIRED')
  ),
  constraint pricing_policy_versions_strategy_v1 check (strategy_type = 'MARKUP_ON_COST'),
  constraint pricing_policy_versions_markup_base_v1 check (markup_base = 'TOTAL_COST'),
  constraint pricing_policy_versions_markup_nonnegative check (markup >= 0),
  constraint pricing_policy_versions_markup_scale check (scale(markup) <= 500),
  constraint pricing_policy_versions_markup_text_limit check (length(markup::text) <= 1024),
  constraint pricing_policy_versions_markup_magnitude check (
    length(split_part(markup::text,'.',1)) <= 1001
  ),
  constraint pricing_policy_versions_publication_metadata_consistent check (
    (status in ('DRAFT','VALIDATING') and published_at is null and published_by is null)
    or
    (status in ('PUBLISHED','RETIRED') and published_at is not null and published_by is not null)
  ),
  constraint pricing_policy_versions_number_unique unique (pricing_policy_id, version_number)
);

create unique index pricing_policy_versions_one_published_idx
  on public.pricing_policy_versions(pricing_policy_id)
  where status = 'PUBLISHED';

create index pricing_policy_versions_status_idx
  on public.pricing_policy_versions(status);

create table public.product_pricing_settings (
  product_id uuid primary key references public.products(id) on delete restrict,
  pricing_policy_id uuid not null references public.pricing_policies(id) on delete restrict,
  minimum_selling_price numeric not null,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  constraint product_pricing_settings_minimum_nonnegative check (minimum_selling_price >= 0),
  constraint product_pricing_settings_minimum_scale check (scale(minimum_selling_price) <= 500),
  constraint product_pricing_settings_minimum_text_limit check (
    length(minimum_selling_price::text) <= 1024
  ),
  constraint product_pricing_settings_minimum_magnitude check (
    length(split_part(minimum_selling_price::text,'.',1)) <= 1001
  ),
  constraint product_pricing_settings_revision_positive check (revision > 0)
);

create index product_pricing_settings_policy_idx
  on public.product_pricing_settings(pricing_policy_id);

create table public.pricing_payment_terms (
  installments smallint primary key,
  rate numeric not null,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  constraint pricing_payment_terms_installments_range check (installments between 1 and 12),
  constraint pricing_payment_terms_rate_range check (rate >= 0 and rate < 1),
  constraint pricing_payment_terms_rate_scale check (scale(rate) <= 500),
  constraint pricing_payment_terms_rate_text_limit check (length(rate::text) <= 1024),
  constraint pricing_payment_terms_free_1_to_3 check (
    installments > 3 or rate = 0
  ),
  constraint pricing_payment_terms_revision_positive check (revision > 0)
);

create table public.pricing_audit_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_key text not null,
  action text not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  before_state jsonb,
  after_state jsonb,
  constraint pricing_audit_events_entity_type_not_blank check (btrim(entity_type) <> ''),
  constraint pricing_audit_events_entity_key_not_blank check (btrim(entity_key) <> ''),
  constraint pricing_audit_events_action_not_blank check (btrim(action) <> '')
);

create index pricing_audit_events_entity_idx
  on public.pricing_audit_events(entity_type, entity_key, occurred_at desc);

comment on table public.pricing_policies is
  'Commercial Pricing policy identity. Configuration is server-managed.';
comment on table public.pricing_policy_versions is
  'Versioned Pricing definitions. v1 persists MARKUP_ON_COST over TOTAL_COST only.';
comment on table public.product_pricing_settings is
  'Official product-to-policy binding plus product-specific minimum selling price.';
comment on table public.pricing_payment_terms is
  'Global financial rate by installment count. 1x-3x must remain zero.';
comment on table public.pricing_audit_events is
  'Append-only audit trail for Pricing configuration mutations.';

create function public.pricing_guard_policy()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.revision <> 1 or new.status not in ('ACTIVE','INACTIVE') then
      raise exception 'INVALID_PRICING_CONFIGURATION';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'PRICING_STATE_CONFLICT';
  end if;

  if old.status = 'ARCHIVED' then
    raise exception 'PRICING_STATE_CONFLICT';
  end if;

  if new.id is distinct from old.id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'PRICING_STATE_CONFLICT';
  end if;

  if new.revision <> old.revision + 1 then
    raise exception 'PRICING_REVISION_CONFLICT';
  end if;

  return new;
end;
$$;

create trigger pricing_policies_guard
before insert or update or delete on public.pricing_policies
for each row execute function public.pricing_guard_policy();

create function public.pricing_guard_policy_version()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'DRAFT'
      or new.revision <> 1
      or new.published_at is not null
      or new.published_by is not null then
      raise exception 'INVALID_PRICING_CONFIGURATION';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'PRICING_STATE_CONFLICT';
  end if;

  if new.id is distinct from old.id
    or new.pricing_policy_id is distinct from old.pricing_policy_id
    or new.version_number is distinct from old.version_number
    or new.schema_version is distinct from old.schema_version
    or new.engine_version is distinct from old.engine_version
    or new.strategy_type is distinct from old.strategy_type
    or new.markup_base is distinct from old.markup_base
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'PRICING_STATE_CONFLICT';
  end if;

  if old.status = 'DRAFT' then
    if new.status = 'DRAFT' then
      if new.revision <> old.revision + 1
        or new.published_at is distinct from old.published_at
        or new.published_by is distinct from old.published_by then
        raise exception 'PRICING_REVISION_CONFLICT';
      end if;
    elsif new.status = 'VALIDATING' then
      if new.revision <> old.revision
        or new.markup is distinct from old.markup
        or new.notes is distinct from old.notes
        or new.published_at is distinct from old.published_at
        or new.published_by is distinct from old.published_by then
        raise exception 'PRICING_STATE_CONFLICT';
      end if;
    else
      raise exception 'PRICING_STATE_CONFLICT';
    end if;
  elsif old.status = 'VALIDATING' then
    if new.status not in ('DRAFT','PUBLISHED') then
      raise exception 'PRICING_STATE_CONFLICT';
    end if;
    if new.revision <> old.revision
      or new.markup is distinct from old.markup
      or new.notes is distinct from old.notes then
      raise exception 'PRICING_STATE_CONFLICT';
    end if;
    if new.status = 'DRAFT' and (
      new.published_at is distinct from old.published_at
      or new.published_by is distinct from old.published_by
    ) then
      raise exception 'PRICING_STATE_CONFLICT';
    end if;
  elsif old.status = 'PUBLISHED' then
    if new.status <> 'RETIRED'
      or new.revision <> old.revision
      or new.markup is distinct from old.markup
      or new.notes is distinct from old.notes
      or new.published_at is distinct from old.published_at
      or new.published_by is distinct from old.published_by then
      raise exception 'PRICING_STATE_CONFLICT';
    end if;
  else
    raise exception 'PRICING_STATE_CONFLICT';
  end if;

  return new;
end;
$$;

create trigger pricing_policy_versions_guard
before insert or update or delete on public.pricing_policy_versions
for each row execute function public.pricing_guard_policy_version();

create function public.pricing_guard_product_settings()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.revision <> 1 then raise exception 'PRICING_REVISION_CONFLICT'; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then raise exception 'PRICING_STATE_CONFLICT'; end if;
  if new.product_id is distinct from old.product_id then
    raise exception 'PRICING_STATE_CONFLICT';
  end if;
  if new.revision <> old.revision + 1 then
    raise exception 'PRICING_REVISION_CONFLICT';
  end if;
  return new;
end;
$$;

create trigger product_pricing_settings_guard
before insert or update or delete on public.product_pricing_settings
for each row execute function public.pricing_guard_product_settings();

create function public.pricing_guard_payment_term()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.revision <> 1 then raise exception 'PRICING_REVISION_CONFLICT'; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then raise exception 'PRICING_STATE_CONFLICT'; end if;
  if new.installments is distinct from old.installments then
    raise exception 'PRICING_STATE_CONFLICT';
  end if;
  if new.revision <> old.revision + 1 then
    raise exception 'PRICING_REVISION_CONFLICT';
  end if;
  return new;
end;
$$;

create trigger pricing_payment_terms_guard
before insert or update or delete on public.pricing_payment_terms
for each row execute function public.pricing_guard_payment_term();

create function public.pricing_guard_audit_event()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  raise exception 'PRICING_AUDIT_APPEND_ONLY';
end;
$$;

create trigger pricing_audit_events_append_only
before update or delete on public.pricing_audit_events
for each row execute function public.pricing_guard_audit_event();

create function public.pricing_get_policy_secure(p_policy_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select to_jsonb(p)
  from public.pricing_policies p
  where p.id = p_policy_id;
$$;

create function public.pricing_get_version_definition_secure(p_version_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'schema_version', v.schema_version,
    'engine_version', v.engine_version,
    'policy', jsonb_build_object(
      'id', p.id,
      'code', p.code,
      'name', p.name,
      'description', p.description,
      'status', p.status
    ),
    'version', jsonb_build_object(
      'id', v.id,
      'pricing_policy_id', v.pricing_policy_id,
      'version_number', v.version_number,
      'revision', v.revision,
      'status', v.status,
      'notes', v.notes,
      'created_at', v.created_at,
      'created_by', v.created_by,
      'published_at', v.published_at,
      'published_by', v.published_by
    ),
    'strategy_type', v.strategy_type,
    'markup', v.markup::text,
    'markup_base', v.markup_base,
    'charges', '[]'::jsonb
  )
  from public.pricing_policy_versions v
  join public.pricing_policies p on p.id = v.pricing_policy_id
  where v.id = p_version_id;
$$;

create function public.pricing_get_product_settings_secure(p_product_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'product_id', s.product_id,
    'pricing_policy_id', s.pricing_policy_id,
    'minimum_selling_price', s.minimum_selling_price::text,
    'revision', s.revision,
    'updated_at', s.updated_at,
    'updated_by', s.updated_by
  )
  from public.product_pricing_settings s
  where s.product_id = p_product_id;
$$;

create function public.pricing_get_payment_term_secure(p_installments integer)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'installments', t.installments,
    'rate', t.rate::text,
    'revision', t.revision,
    'updated_at', t.updated_at,
    'updated_by', t.updated_by
  )
  from public.pricing_payment_terms t
  where t.installments = p_installments;
$$;

create function public.pricing_get_current_published_version_id_secure(p_policy_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object('id', v.id)
  from public.pricing_policy_versions v
  where v.pricing_policy_id = p_policy_id
    and v.status = 'PUBLISHED';
$$;

create function public.pricing_create_policy_secure(
  p_code text,
  p_name text,
  p_description text,
  p_status text,
  p_markup numeric,
  p_notes text,
  p_actor_id uuid,
  p_schema_version text,
  p_engine_version text,
  p_strategy_type text,
  p_markup_base text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_policy public.pricing_policies;
  v_version public.pricing_policy_versions;
begin
  if p_status not in ('ACTIVE','INACTIVE')
    or p_schema_version <> '1.0'
    or p_engine_version <> '1.0'
    or p_strategy_type <> 'MARKUP_ON_COST'
    or p_markup_base <> 'TOTAL_COST'
    or p_markup < 0
    or p_code !~ '^[A-Z][A-Z0-9_]*$'
    or btrim(p_name) = '' then
    raise exception 'INVALID_PRICING_CONFIGURATION';
  end if;

  insert into public.pricing_policies(
    code,name,description,status,created_by,updated_by
  ) values (
    p_code,p_name,p_description,p_status,p_actor_id,p_actor_id
  ) returning * into v_policy;

  insert into public.pricing_policy_versions(
    pricing_policy_id,version_number,revision,schema_version,engine_version,
    status,strategy_type,markup,markup_base,notes,created_by
  ) values (
    v_policy.id,1,1,p_schema_version,p_engine_version,
    'DRAFT',p_strategy_type,p_markup,p_markup_base,p_notes,p_actor_id
  ) returning * into v_version;

  insert into public.pricing_audit_events(
    entity_type,entity_key,action,actor_id,before_state,after_state
  ) values (
    'PRICING_POLICY',v_policy.id::text,'CREATE_POLICY',p_actor_id,null,
    jsonb_build_object(
      'policy',to_jsonb(v_policy),
      'version',jsonb_build_object(
        'id',v_version.id,
        'version_number',v_version.version_number,
        'revision',v_version.revision,
        'status',v_version.status,
        'markup',v_version.markup::text
      )
    )
  );

  return jsonb_build_object(
    'policy_id',v_policy.id,
    'version_id',v_version.id,
    'policy_revision',v_policy.revision,
    'version_revision',v_version.revision
  );
exception
  when unique_violation then raise exception 'PRICING_POLICY_CODE_CONFLICT';
end;
$$;

create function public.pricing_update_policy_secure(
  p_policy_id uuid,
  p_expected_revision integer,
  p_code text,
  p_name text,
  p_description text,
  p_status text,
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_before public.pricing_policies;
  v_after public.pricing_policies;
begin
  select * into v_before
  from public.pricing_policies
  where id = p_policy_id
  for update;

  if not found then raise exception 'PRICING_POLICY_NOT_FOUND'; end if;
  if v_before.revision <> p_expected_revision then
    raise exception 'PRICING_REVISION_CONFLICT';
  end if;
  if v_before.status = 'ARCHIVED' or p_status not in ('ACTIVE','INACTIVE') then
    raise exception 'PRICING_STATE_CONFLICT';
  end if;
  if p_code !~ '^[A-Z][A-Z0-9_]*$' or btrim(p_name) = '' then
    raise exception 'INVALID_PRICING_CONFIGURATION';
  end if;

  update public.pricing_policies
  set code=p_code,
      name=p_name,
      description=p_description,
      status=p_status,
      revision=revision+1,
      updated_at=now(),
      updated_by=p_actor_id
  where id=p_policy_id
  returning * into v_after;

  insert into public.pricing_audit_events(
    entity_type,entity_key,action,actor_id,before_state,after_state
  ) values (
    'PRICING_POLICY',p_policy_id::text,'UPDATE_POLICY',p_actor_id,
    to_jsonb(v_before),to_jsonb(v_after)
  );

  return to_jsonb(v_after);
exception
  when unique_violation then raise exception 'PRICING_POLICY_CODE_CONFLICT';
end;
$$;

create function public.pricing_archive_policy_secure(
  p_policy_id uuid,
  p_expected_revision integer,
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_before public.pricing_policies;
  v_after public.pricing_policies;
begin
  select * into v_before
  from public.pricing_policies
  where id=p_policy_id
  for update;

  if not found then raise exception 'PRICING_POLICY_NOT_FOUND'; end if;
  if v_before.revision <> p_expected_revision then
    raise exception 'PRICING_REVISION_CONFLICT';
  end if;
  if v_before.status = 'ARCHIVED' then
    raise exception 'PRICING_STATE_CONFLICT';
  end if;

  update public.pricing_policies
  set status='ARCHIVED',
      revision=revision+1,
      updated_at=now(),
      updated_by=p_actor_id
  where id=p_policy_id
  returning * into v_after;

  insert into public.pricing_audit_events(
    entity_type,entity_key,action,actor_id,before_state,after_state
  ) values (
    'PRICING_POLICY',p_policy_id::text,'ARCHIVE_POLICY',p_actor_id,
    to_jsonb(v_before),to_jsonb(v_after)
  );

  return to_jsonb(v_after);
end;
$$;

create function public.pricing_create_version_secure(
  p_source_version_id uuid,
  p_expected_revision integer,
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_policy_id uuid;
  v_source public.pricing_policy_versions;
  v_new public.pricing_policy_versions;
  v_next integer;
begin
  select pricing_policy_id into v_policy_id
  from public.pricing_policy_versions
  where id=p_source_version_id;

  if not found then raise exception 'PRICING_VERSION_NOT_FOUND'; end if;

  perform id from public.pricing_policies
  where id=v_policy_id
  for update;

  select * into v_source
  from public.pricing_policy_versions
  where id=p_source_version_id
  for update;

  if not found then raise exception 'PRICING_VERSION_NOT_FOUND'; end if;
  if v_source.revision <> p_expected_revision then
    raise exception 'PRICING_REVISION_CONFLICT';
  end if;
  if v_source.status <> 'PUBLISHED' then
    raise exception 'PRICING_STATE_CONFLICT';
  end if;

  select coalesce(max(version_number),0)+1 into v_next
  from public.pricing_policy_versions
  where pricing_policy_id=v_policy_id;

  insert into public.pricing_policy_versions(
    pricing_policy_id,version_number,revision,schema_version,engine_version,
    status,strategy_type,markup,markup_base,notes,created_by
  ) values (
    v_policy_id,v_next,1,v_source.schema_version,v_source.engine_version,
    'DRAFT',v_source.strategy_type,v_source.markup,v_source.markup_base,
    v_source.notes,p_actor_id
  ) returning * into v_new;

  insert into public.pricing_audit_events(
    entity_type,entity_key,action,actor_id,before_state,after_state
  ) values (
    'PRICING_POLICY_VERSION',v_new.id::text,'CREATE_VERSION',p_actor_id,
    jsonb_build_object(
      'source_version_id',v_source.id,
      'source_revision',v_source.revision
    ),
    jsonb_build_object(
      'pricing_policy_id',v_new.pricing_policy_id,
      'version_number',v_new.version_number,
      'revision',v_new.revision,
      'status',v_new.status,
      'markup',v_new.markup::text
    )
  );

  return jsonb_build_object(
    'pricing_policy_id',v_policy_id,
    'source_version_id',v_source.id,
    'version_id',v_new.id,
    'version_number',v_new.version_number,
    'revision',v_new.revision
  );
exception
  when unique_violation then raise exception 'PRICING_VERSION_CONFLICT';
end;
$$;

create function public.pricing_save_draft_secure(
  p_version_id uuid,
  p_expected_revision integer,
  p_markup numeric,
  p_notes text,
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_policy_id uuid;
  v_before public.pricing_policy_versions;
  v_after public.pricing_policy_versions;
begin
  select pricing_policy_id into v_policy_id
  from public.pricing_policy_versions
  where id=p_version_id;

  if not found then raise exception 'PRICING_VERSION_NOT_FOUND'; end if;

  perform id from public.pricing_policies
  where id=v_policy_id
  for update;

  select * into v_before
  from public.pricing_policy_versions
  where id=p_version_id
  for update;

  if not found then raise exception 'PRICING_VERSION_NOT_FOUND'; end if;
  if v_before.revision <> p_expected_revision then
    raise exception 'PRICING_REVISION_CONFLICT';
  end if;
  if v_before.status <> 'DRAFT' then
    raise exception 'PRICING_STATE_CONFLICT';
  end if;
  if p_markup < 0 then raise exception 'INVALID_PRICING_CONFIGURATION'; end if;

  update public.pricing_policy_versions
  set markup=p_markup,
      notes=p_notes,
      revision=revision+1
  where id=p_version_id
  returning * into v_after;

  insert into public.pricing_audit_events(
    entity_type,entity_key,action,actor_id,before_state,after_state
  ) values (
    'PRICING_POLICY_VERSION',p_version_id::text,'SAVE_DRAFT',p_actor_id,
    jsonb_build_object(
      'revision',v_before.revision,
      'markup',v_before.markup::text,
      'notes',v_before.notes
    ),
    jsonb_build_object(
      'revision',v_after.revision,
      'markup',v_after.markup::text,
      'notes',v_after.notes
    )
  );

  return jsonb_build_object('revision',v_after.revision);
end;
$$;

create function public.pricing_transition_version_secure(
  p_version_id uuid,
  p_expected_revision integer,
  p_target_status text,
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_policy_id uuid;
  v_before public.pricing_policy_versions;
  v_after public.pricing_policy_versions;
begin
  select pricing_policy_id into v_policy_id
  from public.pricing_policy_versions
  where id=p_version_id;

  if not found then raise exception 'PRICING_VERSION_NOT_FOUND'; end if;

  perform id from public.pricing_policies
  where id=v_policy_id
  for update;

  select * into v_before
  from public.pricing_policy_versions
  where id=p_version_id
  for update;

  if not found then raise exception 'PRICING_VERSION_NOT_FOUND'; end if;
  if v_before.revision <> p_expected_revision then
    raise exception 'PRICING_REVISION_CONFLICT';
  end if;

  if not (
    (v_before.status='DRAFT' and p_target_status='VALIDATING')
    or
    (v_before.status='VALIDATING' and p_target_status='DRAFT')
  ) then
    raise exception 'PRICING_STATE_CONFLICT';
  end if;

  update public.pricing_policy_versions
  set status=p_target_status
  where id=p_version_id
  returning * into v_after;

  insert into public.pricing_audit_events(
    entity_type,entity_key,action,actor_id,before_state,after_state
  ) values (
    'PRICING_POLICY_VERSION',p_version_id::text,'TRANSITION_VERSION',p_actor_id,
    jsonb_build_object('status',v_before.status,'revision',v_before.revision),
    jsonb_build_object('status',v_after.status,'revision',v_after.revision)
  );

  return to_jsonb(v_after);
end;
$$;

create function public.pricing_publish_version_secure(
  p_version_id uuid,
  p_expected_revision integer,
  p_expected_current_published_version_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_policy_id uuid;
  v_policy public.pricing_policies;
  v_target public.pricing_policy_versions;
  v_current public.pricing_policy_versions;
  v_current_id uuid;
begin
  select pricing_policy_id into v_policy_id
  from public.pricing_policy_versions
  where id=p_version_id;

  if not found then raise exception 'PRICING_VERSION_NOT_FOUND'; end if;

  select * into v_policy
  from public.pricing_policies
  where id=v_policy_id
  for update;

  if not found then raise exception 'PRICING_POLICY_NOT_FOUND'; end if;
  if v_policy.status='ARCHIVED' then raise exception 'PRICING_STATE_CONFLICT'; end if;

  select * into v_target
  from public.pricing_policy_versions
  where id=p_version_id
  for update;

  if not found then raise exception 'PRICING_VERSION_NOT_FOUND'; end if;
  if v_target.status <> 'VALIDATING' then raise exception 'PRICING_STATE_CONFLICT'; end if;
  if v_target.revision <> p_expected_revision then
    raise exception 'PRICING_REVISION_CONFLICT';
  end if;

  select * into v_current
  from public.pricing_policy_versions
  where pricing_policy_id=v_policy_id and status='PUBLISHED'
  for update;

  if found then v_current_id := v_current.id; else v_current_id := null; end if;

  if v_current_id is distinct from p_expected_current_published_version_id then
    raise exception 'PRICING_PUBLICATION_CONFLICT';
  end if;

  if v_current_id is not null then
    update public.pricing_policy_versions
    set status='RETIRED'
    where id=v_current_id;
  end if;

  update public.pricing_policy_versions
  set status='PUBLISHED',
      published_at=now(),
      published_by=p_actor_id
  where id=p_version_id
  returning * into v_target;

  insert into public.pricing_audit_events(
    entity_type,entity_key,action,actor_id,before_state,after_state
  ) values (
    'PRICING_POLICY_VERSION',p_version_id::text,'PUBLISH_VERSION',p_actor_id,
    jsonb_build_object(
      'target_status','VALIDATING',
      'expected_revision',p_expected_revision,
      'previous_published_version_id',v_current_id
    ),
    jsonb_build_object(
      'target_status',v_target.status,
      'published_at',v_target.published_at,
      'published_by',v_target.published_by
    )
  );

  return to_jsonb(v_target);
end;
$$;

create function public.pricing_set_product_settings_secure(
  p_product_id uuid,
  p_pricing_policy_id uuid,
  p_minimum_selling_price numeric,
  p_expected_revision integer,
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_before public.product_pricing_settings;
  v_after public.product_pricing_settings;
begin
  if p_minimum_selling_price < 0 then
    raise exception 'INVALID_PRICING_CONFIGURATION';
  end if;

  perform id from public.pricing_policies
  where id=p_pricing_policy_id
  for update;
  if not found then raise exception 'PRICING_POLICY_NOT_FOUND'; end if;

  perform id from public.products
  where id=p_product_id;
  if not found then raise exception 'PRICING_PRODUCT_NOT_FOUND'; end if;

  select * into v_before
  from public.product_pricing_settings
  where product_id=p_product_id
  for update;

  if found then
    if p_expected_revision is null then
      raise exception 'PRICING_CONFIGURATION_CONFLICT';
    end if;
    if v_before.revision <> p_expected_revision then
      raise exception 'PRICING_REVISION_CONFLICT';
    end if;

    update public.product_pricing_settings
    set pricing_policy_id=p_pricing_policy_id,
        minimum_selling_price=p_minimum_selling_price,
        revision=revision+1,
        updated_at=now(),
        updated_by=p_actor_id
    where product_id=p_product_id
    returning * into v_after;
  else
    if p_expected_revision is not null then
      raise exception 'PRICING_CONFIGURATION_CONFLICT';
    end if;

    insert into public.product_pricing_settings(
      product_id,pricing_policy_id,minimum_selling_price,revision,updated_by
    ) values (
      p_product_id,p_pricing_policy_id,p_minimum_selling_price,1,p_actor_id
    ) returning * into v_after;
  end if;

  insert into public.pricing_audit_events(
    entity_type,entity_key,action,actor_id,before_state,after_state
  ) values (
    'PRODUCT_PRICING_SETTINGS',p_product_id::text,'SET_PRODUCT_PRICING',p_actor_id,
    case when v_before.product_id is null then null else jsonb_build_object(
      'pricing_policy_id',v_before.pricing_policy_id,
      'minimum_selling_price',v_before.minimum_selling_price::text,
      'revision',v_before.revision
    ) end,
    jsonb_build_object(
      'pricing_policy_id',v_after.pricing_policy_id,
      'minimum_selling_price',v_after.minimum_selling_price::text,
      'revision',v_after.revision
    )
  );

  return jsonb_build_object(
    'product_id',v_after.product_id,
    'pricing_policy_id',v_after.pricing_policy_id,
    'minimum_selling_price',v_after.minimum_selling_price::text,
    'revision',v_after.revision,
    'updated_at',v_after.updated_at,
    'updated_by',v_after.updated_by
  );
exception
  when unique_violation then raise exception 'PRICING_CONFIGURATION_CONFLICT';
end;
$$;

create function public.pricing_set_payment_term_secure(
  p_installments integer,
  p_rate numeric,
  p_expected_revision integer,
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_before public.pricing_payment_terms;
  v_after public.pricing_payment_terms;
begin
  if p_installments < 1 or p_installments > 12
    or p_rate < 0 or p_rate >= 1
    or (p_installments <= 3 and p_rate <> 0) then
    raise exception 'INVALID_PRICING_CONFIGURATION';
  end if;

  select * into v_before
  from public.pricing_payment_terms
  where installments=p_installments
  for update;

  if found then
    if p_expected_revision is null then
      raise exception 'PRICING_CONFIGURATION_CONFLICT';
    end if;
    if v_before.revision <> p_expected_revision then
      raise exception 'PRICING_REVISION_CONFLICT';
    end if;

    update public.pricing_payment_terms
    set rate=p_rate,
        revision=revision+1,
        updated_at=now(),
        updated_by=p_actor_id
    where installments=p_installments
    returning * into v_after;
  else
    if p_expected_revision is not null then
      raise exception 'PRICING_CONFIGURATION_CONFLICT';
    end if;

    insert into public.pricing_payment_terms(
      installments,rate,revision,updated_by
    ) values (
      p_installments,p_rate,1,p_actor_id
    ) returning * into v_after;
  end if;

  insert into public.pricing_audit_events(
    entity_type,entity_key,action,actor_id,before_state,after_state
  ) values (
    'PRICING_PAYMENT_TERM',p_installments::text,'SET_PAYMENT_TERM',p_actor_id,
    case when v_before.installments is null then null else jsonb_build_object(
      'rate',v_before.rate::text,
      'revision',v_before.revision
    ) end,
    jsonb_build_object(
      'rate',v_after.rate::text,
      'revision',v_after.revision
    )
  );

  return jsonb_build_object(
    'installments',v_after.installments,
    'rate',v_after.rate::text,
    'revision',v_after.revision,
    'updated_at',v_after.updated_at,
    'updated_by',v_after.updated_by
  );
exception
  when unique_violation then raise exception 'PRICING_CONFIGURATION_CONFLICT';
end;
$$;

alter table public.pricing_policies enable row level security;
alter table public.pricing_policy_versions enable row level security;
alter table public.product_pricing_settings enable row level security;
alter table public.pricing_payment_terms enable row level security;
alter table public.pricing_audit_events enable row level security;

revoke all on table public.pricing_policies from public, anon, authenticated, service_role;
revoke all on table public.pricing_policy_versions from public, anon, authenticated, service_role;
revoke all on table public.product_pricing_settings from public, anon, authenticated, service_role;
revoke all on table public.pricing_payment_terms from public, anon, authenticated, service_role;
revoke all on table public.pricing_audit_events from public, anon, authenticated, service_role;

grant select, insert, update on table public.pricing_policies to service_role;
grant select, insert, update on table public.pricing_policy_versions to service_role;
grant select, insert, update on table public.product_pricing_settings to service_role;
grant select, insert, update on table public.pricing_payment_terms to service_role;
grant select, insert on table public.pricing_audit_events to service_role;

revoke execute on function public.pricing_guard_policy() from public, anon, authenticated, service_role;
revoke execute on function public.pricing_guard_policy_version() from public, anon, authenticated, service_role;
revoke execute on function public.pricing_guard_product_settings() from public, anon, authenticated, service_role;
revoke execute on function public.pricing_guard_payment_term() from public, anon, authenticated, service_role;
revoke execute on function public.pricing_guard_audit_event() from public, anon, authenticated, service_role;

revoke execute on function public.pricing_get_policy_secure(uuid) from public, anon, authenticated;
revoke execute on function public.pricing_get_version_definition_secure(uuid) from public, anon, authenticated;
revoke execute on function public.pricing_get_product_settings_secure(uuid) from public, anon, authenticated;
revoke execute on function public.pricing_get_payment_term_secure(integer) from public, anon, authenticated;
revoke execute on function public.pricing_get_current_published_version_id_secure(uuid) from public, anon, authenticated;
revoke execute on function public.pricing_create_policy_secure(text,text,text,text,numeric,text,uuid,text,text,text,text) from public, anon, authenticated;
revoke execute on function public.pricing_update_policy_secure(uuid,integer,text,text,text,text,uuid) from public, anon, authenticated;
revoke execute on function public.pricing_archive_policy_secure(uuid,integer,uuid) from public, anon, authenticated;
revoke execute on function public.pricing_create_version_secure(uuid,integer,uuid) from public, anon, authenticated;
revoke execute on function public.pricing_save_draft_secure(uuid,integer,numeric,text,uuid) from public, anon, authenticated;
revoke execute on function public.pricing_transition_version_secure(uuid,integer,text,uuid) from public, anon, authenticated;
revoke execute on function public.pricing_publish_version_secure(uuid,integer,uuid,uuid) from public, anon, authenticated;
revoke execute on function public.pricing_set_product_settings_secure(uuid,uuid,numeric,integer,uuid) from public, anon, authenticated;
revoke execute on function public.pricing_set_payment_term_secure(integer,numeric,integer,uuid) from public, anon, authenticated;

grant execute on function public.pricing_get_policy_secure(uuid) to service_role;
grant execute on function public.pricing_get_version_definition_secure(uuid) to service_role;
grant execute on function public.pricing_get_product_settings_secure(uuid) to service_role;
grant execute on function public.pricing_get_payment_term_secure(integer) to service_role;
grant execute on function public.pricing_get_current_published_version_id_secure(uuid) to service_role;
grant execute on function public.pricing_create_policy_secure(text,text,text,text,numeric,text,uuid,text,text,text,text) to service_role;
grant execute on function public.pricing_update_policy_secure(uuid,integer,text,text,text,text,uuid) to service_role;
grant execute on function public.pricing_archive_policy_secure(uuid,integer,uuid) to service_role;
grant execute on function public.pricing_create_version_secure(uuid,integer,uuid) to service_role;
grant execute on function public.pricing_save_draft_secure(uuid,integer,numeric,text,uuid) to service_role;
grant execute on function public.pricing_transition_version_secure(uuid,integer,text,uuid) to service_role;
grant execute on function public.pricing_publish_version_secure(uuid,integer,uuid,uuid) to service_role;
grant execute on function public.pricing_set_product_settings_secure(uuid,uuid,numeric,integer,uuid) to service_role;
grant execute on function public.pricing_set_payment_term_secure(integer,numeric,integer,uuid) to service_role;
