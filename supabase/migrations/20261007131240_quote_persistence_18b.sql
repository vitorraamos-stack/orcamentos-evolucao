-- 18B Quote persistence with immutable calculation snapshots.

create sequence public.quote_number_seq;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number bigint not null default nextval('public.quote_number_seq'),
  status text not null default 'DRAFT',
  revision integer not null default 1,
  current_snapshot_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  constraint quotes_quote_number_unique unique (quote_number),
  constraint quotes_status_valid check (status in ('DRAFT','SENT','ACCEPTED','REJECTED','CANCELLED')),
  constraint quotes_revision_positive check (revision > 0)
);

create table public.quote_snapshots (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete restrict,
  version_number integer not null,
  calculation_version text not null,
  product_id uuid not null references public.products(id) on delete restrict,
  product_version_id uuid not null references public.product_versions(id) on delete restrict,
  product_version_number integer not null,
  product_version_revision integer not null,
  pricing_policy_id uuid not null references public.pricing_policies(id) on delete restrict,
  pricing_policy_version_id uuid not null references public.pricing_policy_versions(id) on delete restrict,
  pricing_policy_version_number integer not null,
  pricing_policy_version_revision integer not null,
  product_pricing_settings_revision integer not null,
  payment_rate_source text not null,
  payment_term_revision integer,
  installation_settings_revision integer,
  costing_aggregation_version text not null,
  effective_cost_at timestamptz not null,
  commercial_quantity numeric not null,
  installments smallint not null,
  total_selling_price numeric not null,
  request_snapshot jsonb not null,
  public_result_snapshot jsonb not null,
  private_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  constraint quote_snapshots_version_unique unique (quote_id, version_number),
  constraint quote_snapshots_id_quote_unique unique (id, quote_id),
  constraint quote_snapshots_version_positive check (version_number > 0),
  constraint quote_snapshots_calculation_version_v1 check (calculation_version = '1.0'),
  constraint quote_snapshots_product_version_number_positive check (product_version_number > 0),
  constraint quote_snapshots_product_version_revision_positive check (product_version_revision > 0),
  constraint quote_snapshots_pricing_version_number_positive check (pricing_policy_version_number > 0),
  constraint quote_snapshots_pricing_version_revision_positive check (pricing_policy_version_revision > 0),
  constraint quote_snapshots_product_settings_revision_positive check (product_pricing_settings_revision > 0),
  constraint quote_snapshots_payment_rate_source_valid check (payment_rate_source in ('SYSTEM_ZERO','CONFIGURED')),
  constraint quote_snapshots_payment_revision_consistent check (
    (payment_rate_source = 'SYSTEM_ZERO' and payment_term_revision is null)
    or
    (payment_rate_source = 'CONFIGURED' and payment_term_revision is not null and payment_term_revision > 0)
  ),
  constraint quote_snapshots_installation_revision_positive check (
    installation_settings_revision is null or installation_settings_revision > 0
  ),
  constraint quote_snapshots_costing_version_v1 check (costing_aggregation_version = '1.0'),
  constraint quote_snapshots_quantity_positive check (commercial_quantity > 0),
  constraint quote_snapshots_quantity_finite check (
    commercial_quantity::text not in ('NaN','Infinity','-Infinity')
  ),
  constraint quote_snapshots_installments_range check (installments between 1 and 12),
  constraint quote_snapshots_total_nonnegative check (total_selling_price >= 0),
  constraint quote_snapshots_total_finite check (
    total_selling_price::text not in ('NaN','Infinity','-Infinity')
  ),
  constraint quote_snapshots_total_scale check (scale(total_selling_price) <= 2),
  constraint quote_snapshots_json_objects check (
    jsonb_typeof(request_snapshot) = 'object'
    and jsonb_typeof(public_result_snapshot) = 'object'
    and jsonb_typeof(private_snapshot) = 'object'
  )
);

alter table public.quotes
  add constraint quotes_current_snapshot_fk
  foreign key (current_snapshot_id, id)
  references public.quote_snapshots(id, quote_id)
  on delete restrict
  deferrable initially deferred;

create index quote_snapshots_quote_created_idx
  on public.quote_snapshots(quote_id, version_number desc);

create table public.quote_events (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete restrict,
  snapshot_id uuid not null,
  event_type text not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  constraint quote_events_snapshot_fk
    foreign key (snapshot_id, quote_id)
    references public.quote_snapshots(id, quote_id)
    on delete restrict,
  constraint quote_events_type_valid check (
    event_type in ('QUOTE_CREATED','SNAPSHOT_APPENDED','STATUS_CHANGED')
  ),
  constraint quote_events_payload_object check (jsonb_typeof(payload) = 'object')
);

create index quote_events_quote_idx
  on public.quote_events(quote_id, occurred_at desc);

comment on table public.quotes is
  'Quote identity and lifecycle. The current snapshot pointer references the latest immutable official calculation.';
comment on table public.quote_snapshots is
  'Append-only server-generated snapshots of official Quote calculations, including private Costing/Pricing provenance.';
comment on table public.quote_events is
  'Append-only audit trail for Quote creation, snapshot saves, and lifecycle changes.';

alter table public.quotes enable row level security;
alter table public.quote_snapshots enable row level security;
alter table public.quote_events enable row level security;

create function public.quote_guard_quote()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'DRAFT' or new.revision <> 1 or new.current_snapshot_id is null then
      raise exception 'INVALID_QUOTE_CONFIGURATION';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'QUOTE_STATE_CONFLICT';
  end if;

  if new.id is distinct from old.id
    or new.quote_number is distinct from old.quote_number
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'QUOTE_STATE_CONFLICT';
  end if;

  if new.revision <> old.revision + 1 then
    raise exception 'QUOTE_REVISION_CONFLICT';
  end if;

  if new.status = old.status then
    if old.status <> 'DRAFT'
      or new.current_snapshot_id is not distinct from old.current_snapshot_id then
      raise exception 'QUOTE_STATE_CONFLICT';
    end if;
  else
    if new.current_snapshot_id is distinct from old.current_snapshot_id then
      raise exception 'QUOTE_STATE_CONFLICT';
    end if;
    if not (
      (old.status = 'DRAFT' and new.status in ('SENT','CANCELLED'))
      or
      (old.status = 'SENT' and new.status in ('DRAFT','ACCEPTED','REJECTED','CANCELLED'))
    ) then
      raise exception 'QUOTE_STATE_CONFLICT';
    end if;
  end if;

  return new;
end;
$$;

create trigger quotes_guard
before insert or update or delete on public.quotes
for each row execute function public.quote_guard_quote();

create function public.quote_guard_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_status text;
begin
  if tg_op in ('UPDATE','DELETE') then
    raise exception 'QUOTE_SNAPSHOT_IMMUTABLE';
  end if;

  select status into v_status
  from public.quotes
  where id=new.quote_id;

  if v_status is distinct from 'DRAFT' then
    raise exception 'QUOTE_STATE_CONFLICT';
  end if;

  return new;
end;
$$;

create trigger quote_snapshots_guard
before insert or update or delete on public.quote_snapshots
for each row execute function public.quote_guard_snapshot();

create function public.quote_guard_event()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    raise exception 'QUOTE_AUDIT_APPEND_ONLY';
  end if;
  return new;
end;
$$;

create trigger quote_events_guard
before update or delete on public.quote_events
for each row execute function public.quote_guard_event();

create function public.quote_create_with_snapshot_secure(
  p_actor_id uuid,
  p_calculation_version text,
  p_product_id uuid,
  p_product_version_id uuid,
  p_product_version_number integer,
  p_product_version_revision integer,
  p_pricing_policy_id uuid,
  p_pricing_policy_version_id uuid,
  p_pricing_policy_version_number integer,
  p_pricing_policy_version_revision integer,
  p_product_pricing_settings_revision integer,
  p_payment_rate_source text,
  p_payment_term_revision integer,
  p_installation_settings_revision integer,
  p_costing_aggregation_version text,
  p_effective_cost_at timestamptz,
  p_commercial_quantity numeric,
  p_installments integer,
  p_total_selling_price numeric,
  p_request_snapshot jsonb,
  p_public_result_snapshot jsonb,
  p_private_snapshot jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_quote_id uuid := gen_random_uuid();
  v_snapshot_id uuid := gen_random_uuid();
  v_quote public.quotes;
  v_snapshot public.quote_snapshots;
begin
  insert into public.quotes(
    id,status,revision,current_snapshot_id,created_by,updated_by
  ) values (
    v_quote_id,'DRAFT',1,v_snapshot_id,p_actor_id,p_actor_id
  ) returning * into v_quote;

  insert into public.quote_snapshots(
    id,quote_id,version_number,calculation_version,
    product_id,product_version_id,product_version_number,product_version_revision,
    pricing_policy_id,pricing_policy_version_id,pricing_policy_version_number,
    pricing_policy_version_revision,product_pricing_settings_revision,
    payment_rate_source,payment_term_revision,installation_settings_revision,
    costing_aggregation_version,effective_cost_at,commercial_quantity,installments,
    total_selling_price,request_snapshot,public_result_snapshot,private_snapshot,created_by
  ) values (
    v_snapshot_id,v_quote_id,1,p_calculation_version,
    p_product_id,p_product_version_id,p_product_version_number,p_product_version_revision,
    p_pricing_policy_id,p_pricing_policy_version_id,p_pricing_policy_version_number,
    p_pricing_policy_version_revision,p_product_pricing_settings_revision,
    p_payment_rate_source,p_payment_term_revision,p_installation_settings_revision,
    p_costing_aggregation_version,p_effective_cost_at,p_commercial_quantity,p_installments,
    p_total_selling_price,p_request_snapshot,p_public_result_snapshot,p_private_snapshot,p_actor_id
  ) returning * into v_snapshot;

  insert into public.quote_events(
    quote_id,snapshot_id,event_type,actor_id,payload
  ) values (
    v_quote_id,v_snapshot_id,'QUOTE_CREATED',p_actor_id,
    jsonb_build_object('quote_revision',1,'snapshot_version',1)
  );

  return jsonb_build_object(
    'quote_id',v_quote.id,
    'quote_number',v_quote.quote_number,
    'status',v_quote.status,
    'revision',v_quote.revision,
    'snapshot_id',v_snapshot.id,
    'snapshot_version',v_snapshot.version_number,
    'saved_at',v_snapshot.created_at
  );
end;
$$;

create function public.quote_append_snapshot_secure(
  p_quote_id uuid,
  p_expected_revision integer,
  p_actor_id uuid,
  p_calculation_version text,
  p_product_id uuid,
  p_product_version_id uuid,
  p_product_version_number integer,
  p_product_version_revision integer,
  p_pricing_policy_id uuid,
  p_pricing_policy_version_id uuid,
  p_pricing_policy_version_number integer,
  p_pricing_policy_version_revision integer,
  p_product_pricing_settings_revision integer,
  p_payment_rate_source text,
  p_payment_term_revision integer,
  p_installation_settings_revision integer,
  p_costing_aggregation_version text,
  p_effective_cost_at timestamptz,
  p_commercial_quantity numeric,
  p_installments integer,
  p_total_selling_price numeric,
  p_request_snapshot jsonb,
  p_public_result_snapshot jsonb,
  p_private_snapshot jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_quote public.quotes;
  v_snapshot public.quote_snapshots;
  v_snapshot_id uuid := gen_random_uuid();
  v_next_version integer;
begin
  select * into v_quote
  from public.quotes
  where id = p_quote_id
  for update;

  if not found then raise exception 'QUOTE_NOT_FOUND'; end if;
  if v_quote.revision <> p_expected_revision then raise exception 'QUOTE_REVISION_CONFLICT'; end if;
  if v_quote.status <> 'DRAFT' then raise exception 'QUOTE_STATE_CONFLICT'; end if;

  select coalesce(max(version_number),0)+1
  into v_next_version
  from public.quote_snapshots
  where quote_id = p_quote_id;

  insert into public.quote_snapshots(
    id,quote_id,version_number,calculation_version,
    product_id,product_version_id,product_version_number,product_version_revision,
    pricing_policy_id,pricing_policy_version_id,pricing_policy_version_number,
    pricing_policy_version_revision,product_pricing_settings_revision,
    payment_rate_source,payment_term_revision,installation_settings_revision,
    costing_aggregation_version,effective_cost_at,commercial_quantity,installments,
    total_selling_price,request_snapshot,public_result_snapshot,private_snapshot,created_by
  ) values (
    v_snapshot_id,p_quote_id,v_next_version,p_calculation_version,
    p_product_id,p_product_version_id,p_product_version_number,p_product_version_revision,
    p_pricing_policy_id,p_pricing_policy_version_id,p_pricing_policy_version_number,
    p_pricing_policy_version_revision,p_product_pricing_settings_revision,
    p_payment_rate_source,p_payment_term_revision,p_installation_settings_revision,
    p_costing_aggregation_version,p_effective_cost_at,p_commercial_quantity,p_installments,
    p_total_selling_price,p_request_snapshot,p_public_result_snapshot,p_private_snapshot,p_actor_id
  ) returning * into v_snapshot;

  update public.quotes
  set current_snapshot_id=v_snapshot_id,
      revision=revision+1,
      updated_at=now(),
      updated_by=p_actor_id
  where id=p_quote_id
  returning * into v_quote;

  insert into public.quote_events(
    quote_id,snapshot_id,event_type,actor_id,payload
  ) values (
    p_quote_id,v_snapshot_id,'SNAPSHOT_APPENDED',p_actor_id,
    jsonb_build_object('quote_revision',v_quote.revision,'snapshot_version',v_snapshot.version_number)
  );

  return jsonb_build_object(
    'quote_id',v_quote.id,
    'quote_number',v_quote.quote_number,
    'status',v_quote.status,
    'revision',v_quote.revision,
    'snapshot_id',v_snapshot.id,
    'snapshot_version',v_snapshot.version_number,
    'saved_at',v_snapshot.created_at
  );
exception
  when unique_violation then raise exception 'QUOTE_VERSION_CONFLICT';
end;
$$;

create function public.quote_transition_status_secure(
  p_quote_id uuid,
  p_expected_revision integer,
  p_target_status text,
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_before public.quotes;
  v_after public.quotes;
begin
  select * into v_before
  from public.quotes
  where id=p_quote_id
  for update;

  if not found then raise exception 'QUOTE_NOT_FOUND'; end if;
  if v_before.revision <> p_expected_revision then raise exception 'QUOTE_REVISION_CONFLICT'; end if;

  update public.quotes
  set status=p_target_status,
      revision=revision+1,
      updated_at=now(),
      updated_by=p_actor_id
  where id=p_quote_id
  returning * into v_after;

  insert into public.quote_events(
    quote_id,snapshot_id,event_type,actor_id,payload
  ) values (
    p_quote_id,v_after.current_snapshot_id,'STATUS_CHANGED',p_actor_id,
    jsonb_build_object('from',v_before.status,'to',v_after.status,'quote_revision',v_after.revision)
  );

  return jsonb_build_object(
    'quote_id',v_after.id,
    'quote_number',v_after.quote_number,
    'status',v_after.status,
    'revision',v_after.revision,
    'snapshot_id',v_after.current_snapshot_id,
    'updated_at',v_after.updated_at
  );
end;
$$;

create function public.quote_get_current_secure(p_quote_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'quote', jsonb_build_object(
      'id',q.id,'quote_number',q.quote_number,'status',q.status,'revision',q.revision,
      'current_snapshot_id',q.current_snapshot_id,'created_at',q.created_at,'created_by',q.created_by,
      'updated_at',q.updated_at,'updated_by',q.updated_by
    ),
    'snapshot', jsonb_build_object(
      'id',s.id,'quote_id',s.quote_id,'version_number',s.version_number,
      'calculation_version',s.calculation_version,'product_id',s.product_id,
      'product_version_id',s.product_version_id,'product_version_number',s.product_version_number,
      'product_version_revision',s.product_version_revision,'pricing_policy_id',s.pricing_policy_id,
      'pricing_policy_version_id',s.pricing_policy_version_id,
      'pricing_policy_version_number',s.pricing_policy_version_number,
      'pricing_policy_version_revision',s.pricing_policy_version_revision,
      'product_pricing_settings_revision',s.product_pricing_settings_revision,
      'payment_rate_source',s.payment_rate_source,'payment_term_revision',s.payment_term_revision,
      'installation_settings_revision',s.installation_settings_revision,
      'costing_aggregation_version',s.costing_aggregation_version,'effective_cost_at',s.effective_cost_at,
      'commercial_quantity',s.commercial_quantity::text,'installments',s.installments,
      'total_selling_price',s.total_selling_price::text,'request_snapshot',s.request_snapshot,
      'public_result_snapshot',s.public_result_snapshot,'private_snapshot',s.private_snapshot,
      'created_at',s.created_at,'created_by',s.created_by
    )
  )
  from public.quotes q
  join public.quote_snapshots s on s.id=q.current_snapshot_id and s.quote_id=q.id
  where q.id=p_quote_id;
$$;

revoke all on table public.quotes from public, anon, authenticated, service_role;
revoke all on table public.quote_snapshots from public, anon, authenticated, service_role;
revoke all on table public.quote_events from public, anon, authenticated, service_role;
grant select, insert, update on table public.quotes to service_role;
grant select, insert on table public.quote_snapshots to service_role;
grant select, insert on table public.quote_events to service_role;

revoke all on sequence public.quote_number_seq from public, anon, authenticated, service_role;
grant usage, select on sequence public.quote_number_seq to service_role;

revoke all on function public.quote_guard_quote() from public, anon, authenticated, service_role;
revoke all on function public.quote_guard_snapshot() from public, anon, authenticated, service_role;
revoke all on function public.quote_guard_event() from public, anon, authenticated, service_role;

revoke all on function public.quote_create_with_snapshot_secure(
  uuid,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,jsonb,jsonb,jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.quote_create_with_snapshot_secure(
  uuid,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,jsonb,jsonb,jsonb
) to service_role;

revoke all on function public.quote_append_snapshot_secure(
  uuid,integer,uuid,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,jsonb,jsonb,jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.quote_append_snapshot_secure(
  uuid,integer,uuid,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,jsonb,jsonb,jsonb
) to service_role;

revoke all on function public.quote_transition_status_secure(uuid,integer,text,uuid)
from public, anon, authenticated, service_role;
grant execute on function public.quote_transition_status_secure(uuid,integer,text,uuid)
to service_role;

revoke all on function public.quote_get_current_secure(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.quote_get_current_secure(uuid)
to service_role;
