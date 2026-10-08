-- 18G Quote negotiation persistence foundation.
-- Runtime keeps using v2 RPCs until the API integration is released separately.

alter table public.quote_snapshots
  add column official_total_selling_price numeric,
  add column minimum_allowed_total numeric,
  add column negotiation_private_snapshot jsonb;

alter table public.quote_snapshots
  add constraint quote_snapshots_negotiation_columns_together check (
    (
      official_total_selling_price is null
      and minimum_allowed_total is null
      and negotiation_private_snapshot is null
    )
    or
    (
      official_total_selling_price is not null
      and minimum_allowed_total is not null
      and negotiation_private_snapshot is not null
    )
  ),
  add constraint quote_snapshots_official_total_valid check (
    official_total_selling_price is null
    or (
      official_total_selling_price >= 0
      and official_total_selling_price::text not in ('NaN','Infinity','-Infinity')
      and scale(official_total_selling_price) <= 2
    )
  ),
  add constraint quote_snapshots_minimum_allowed_valid check (
    minimum_allowed_total is null
    or (
      minimum_allowed_total >= 0
      and minimum_allowed_total::text not in ('NaN','Infinity','-Infinity')
      and scale(minimum_allowed_total) <= 2
    )
  ),
  add constraint quote_snapshots_minimum_not_above_official check (
    minimum_allowed_total is null
    or official_total_selling_price is null
    or minimum_allowed_total <= official_total_selling_price
  ),
  add constraint quote_snapshots_negotiation_private_object check (
    negotiation_private_snapshot is null
    or jsonb_typeof(negotiation_private_snapshot) = 'object'
  );

comment on column public.quote_snapshots.official_total_selling_price is
  '18G official server-calculated Quote total before any manager negotiation. Null only for legacy/v2 snapshots.';
comment on column public.quote_snapshots.minimum_allowed_total is
  '18G private protected Quote floor derived server-side. Never expose to consultant/client DTOs. Null only for legacy/v2 snapshots.';
comment on column public.quote_snapshots.negotiation_private_snapshot is
  '18G private manager negotiation evidence. Null only for legacy/v2 snapshots.';

create function public.quote_assert_negotiation_v1(
  p_actor_id uuid,
  p_official_total_selling_price numeric,
  p_minimum_allowed_total numeric,
  p_total_selling_price numeric,
  p_negotiation_private_snapshot jsonb
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_mode text;
  v_role text;
  v_adjustment_kind text;
  v_expected_adjustment_kind text;
  v_adjustment_amount numeric;
  v_expected_adjustment_amount numeric;
  v_below_minimum boolean;
  v_expected_below_minimum boolean;
  v_below_minimum_override boolean;
  v_reason text;
  v_snapshot_official numeric;
  v_snapshot_minimum numeric;
  v_snapshot_final numeric;
begin
  if p_official_total_selling_price is null
    or p_minimum_allowed_total is null
    or p_total_selling_price is null
    or p_negotiation_private_snapshot is null
    or jsonb_typeof(p_negotiation_private_snapshot) <> 'object'
    or p_official_total_selling_price < 0
    or p_minimum_allowed_total < 0
    or p_total_selling_price < 0
    or p_official_total_selling_price::text in ('NaN','Infinity','-Infinity')
    or p_minimum_allowed_total::text in ('NaN','Infinity','-Infinity')
    or p_total_selling_price::text in ('NaN','Infinity','-Infinity')
    or scale(p_official_total_selling_price) > 2
    or scale(p_minimum_allowed_total) > 2
    or scale(p_total_selling_price) > 2
    or p_minimum_allowed_total > p_official_total_selling_price then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  v_mode := p_negotiation_private_snapshot->>'mode';
  v_adjustment_kind := p_negotiation_private_snapshot->>'adjustmentKind';
  v_reason := p_negotiation_private_snapshot->>'reason';

  if coalesce(p_negotiation_private_snapshot->'officialTotal'->>'currency','') <> 'BRL'
    or coalesce(p_negotiation_private_snapshot->'minimumAllowedTotal'->>'currency','') <> 'BRL'
    or coalesce(p_negotiation_private_snapshot->'finalTotal'->>'currency','') <> 'BRL'
    or coalesce(p_negotiation_private_snapshot->'adjustmentAmount'->>'currency','') <> 'BRL'
    or coalesce(p_negotiation_private_snapshot->'officialTotal'->>'amount','') !~ '^[0-9]+\\.[0-9]{2}
    or coalesce(p_negotiation_private_snapshot->'minimumAllowedTotal'->>'amount','') !~ '^\\d+\\.\\d{2}$'
    or coalesce(p_negotiation_private_snapshot->'finalTotal'->>'amount','') !~ '^\\d+\\.\\d{2}$'
    or coalesce(p_negotiation_private_snapshot->'adjustmentAmount'->>'amount','') !~ '^\\d+\\.\\d{2}$'
    or coalesce(p_negotiation_private_snapshot->>'belowMinimum','') not in ('true','false')
    or coalesce(p_negotiation_private_snapshot->>'belowMinimumOverride','') not in ('true','false') then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  v_snapshot_official :=
    (p_negotiation_private_snapshot->'officialTotal'->>'amount')::numeric;
  v_snapshot_minimum :=
    (p_negotiation_private_snapshot->'minimumAllowedTotal'->>'amount')::numeric;
  v_snapshot_final :=
    (p_negotiation_private_snapshot->'finalTotal'->>'amount')::numeric;
  v_adjustment_amount :=
    (p_negotiation_private_snapshot->'adjustmentAmount'->>'amount')::numeric;
  v_below_minimum :=
    (p_negotiation_private_snapshot->>'belowMinimum')::boolean;
  v_below_minimum_override :=
    (p_negotiation_private_snapshot->>'belowMinimumOverride')::boolean;

  if v_snapshot_official <> p_official_total_selling_price
    or v_snapshot_minimum <> p_minimum_allowed_total
    or v_snapshot_final <> p_total_selling_price then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  v_expected_below_minimum := p_total_selling_price < p_minimum_allowed_total;
  v_expected_adjustment_amount :=
    abs(p_official_total_selling_price - p_total_selling_price);
  v_expected_adjustment_kind :=
    case
      when p_total_selling_price < p_official_total_selling_price then 'DISCOUNT'
      when p_total_selling_price > p_official_total_selling_price then 'SURCHARGE'
      else 'NONE'
    end;

  if v_adjustment_kind is distinct from v_expected_adjustment_kind
    or v_adjustment_amount <> v_expected_adjustment_amount
    or v_below_minimum is distinct from v_expected_below_minimum then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  if v_mode = 'OFFICIAL' then
    if p_total_selling_price <> p_official_total_selling_price
      or v_adjustment_kind <> 'NONE'
      or v_adjustment_amount <> 0
      or v_below_minimum
      or v_below_minimum_override
      or v_reason is not null then
      raise exception 'INVALID_QUOTE_NEGOTIATION';
    end if;
    return;
  end if;

  if v_mode <> 'MANAGER_FINAL_PRICE' then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  select case
    when p.role='admin' then 'gerente'
    when p.role='consultor' then 'consultor_vendas'
    else p.role
  end
  into v_role
  from public.profiles p
  where p.id=p_actor_id;

  if v_role is distinct from 'gerente' then
    raise exception 'QUOTE_NEGOTIATION_FORBIDDEN';
  end if;

  if char_length(btrim(coalesce(v_reason,''))) < 5
    or char_length(btrim(coalesce(v_reason,''))) > 500 then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  if v_expected_below_minimum is distinct from v_below_minimum_override then
    raise exception 'BELOW_MINIMUM_OVERRIDE_REQUIRED';
  end if;
end;
$$;

revoke all on function public.quote_assert_negotiation_v1(
  uuid,numeric,numeric,numeric,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.quote_assert_negotiation_v1(
  uuid,numeric,numeric,numeric,jsonb
) to service_role;

create function public.quote_create_with_snapshot_v3_secure(
  p_actor_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_title text,
  p_commercial_snapshot jsonb,
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
  p_official_total_selling_price numeric,
  p_minimum_allowed_total numeric,
  p_total_selling_price numeric,
  p_negotiation_private_snapshot jsonb,
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
  perform public.quote_assert_negotiation_v1(
    p_actor_id,
    p_official_total_selling_price,
    p_minimum_allowed_total,
    p_total_selling_price,
    p_negotiation_private_snapshot
  );

  insert into public.quotes(
    id,status,revision,current_snapshot_id,
    customer_name,customer_phone,title,
    created_by,updated_by
  ) values (
    v_quote_id,'DRAFT',1,v_snapshot_id,
    btrim(p_customer_name),nullif(btrim(p_customer_phone),''),
    btrim(p_title),p_actor_id,p_actor_id
  ) returning * into v_quote;

  insert into public.quote_snapshots(
    id,quote_id,version_number,calculation_version,
    product_id,product_version_id,product_version_number,product_version_revision,
    pricing_policy_id,pricing_policy_version_id,pricing_policy_version_number,
    pricing_policy_version_revision,product_pricing_settings_revision,
    payment_rate_source,payment_term_revision,installation_settings_revision,
    costing_aggregation_version,effective_cost_at,commercial_quantity,installments,
    official_total_selling_price,minimum_allowed_total,total_selling_price,
    negotiation_private_snapshot,request_snapshot,public_result_snapshot,private_snapshot,
    commercial_snapshot,created_by
  ) values (
    v_snapshot_id,v_quote_id,1,p_calculation_version,
    p_product_id,p_product_version_id,p_product_version_number,p_product_version_revision,
    p_pricing_policy_id,p_pricing_policy_version_id,p_pricing_policy_version_number,
    p_pricing_policy_version_revision,p_product_pricing_settings_revision,
    p_payment_rate_source,p_payment_term_revision,p_installation_settings_revision,
    p_costing_aggregation_version,p_effective_cost_at,p_commercial_quantity,p_installments,
    p_official_total_selling_price,p_minimum_allowed_total,p_total_selling_price,
    p_negotiation_private_snapshot,p_request_snapshot,p_public_result_snapshot,p_private_snapshot,
    p_commercial_snapshot,p_actor_id
  ) returning * into v_snapshot;

  insert into public.quote_events(
    quote_id,snapshot_id,event_type,actor_id,payload
  ) values (
    v_quote_id,v_snapshot_id,'QUOTE_CREATED',p_actor_id,
    jsonb_build_object(
      'quote_revision',1,
      'snapshot_version',1,
      'commercial',p_commercial_snapshot,
      'pricing_mode',p_negotiation_private_snapshot->>'mode',
      'below_minimum_override',
        (p_negotiation_private_snapshot->>'belowMinimumOverride')::boolean
    )
  );

  return jsonb_build_object(
    'quote_id',v_quote.id,
    'quote_number',v_quote.quote_number,
    'status',v_quote.status,
    'revision',v_quote.revision,
    'snapshot_id',v_snapshot.id,
    'snapshot_version',v_snapshot.version_number,
    'saved_at',v_snapshot.created_at,
    'customer_name',v_quote.customer_name,
    'customer_phone',v_quote.customer_phone,
    'title',v_quote.title
  );
end;
$$;

create function public.quote_append_snapshot_v3_secure(
  p_quote_id uuid,
  p_expected_revision integer,
  p_actor_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_title text,
  p_commercial_snapshot jsonb,
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
  p_official_total_selling_price numeric,
  p_minimum_allowed_total numeric,
  p_total_selling_price numeric,
  p_negotiation_private_snapshot jsonb,
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
  perform public.quote_assert_negotiation_v1(
    p_actor_id,
    p_official_total_selling_price,
    p_minimum_allowed_total,
    p_total_selling_price,
    p_negotiation_private_snapshot
  );

  select * into v_quote
  from public.quotes
  where id=p_quote_id
  for update;

  if not found then raise exception 'QUOTE_NOT_FOUND'; end if;
  if v_quote.revision <> p_expected_revision then raise exception 'QUOTE_REVISION_CONFLICT'; end if;
  if v_quote.status <> 'DRAFT' then raise exception 'QUOTE_STATE_CONFLICT'; end if;

  select coalesce(max(version_number),0)+1
  into v_next_version
  from public.quote_snapshots
  where quote_id=p_quote_id;

  insert into public.quote_snapshots(
    id,quote_id,version_number,calculation_version,
    product_id,product_version_id,product_version_number,product_version_revision,
    pricing_policy_id,pricing_policy_version_id,pricing_policy_version_number,
    pricing_policy_version_revision,product_pricing_settings_revision,
    payment_rate_source,payment_term_revision,installation_settings_revision,
    costing_aggregation_version,effective_cost_at,commercial_quantity,installments,
    official_total_selling_price,minimum_allowed_total,total_selling_price,
    negotiation_private_snapshot,request_snapshot,public_result_snapshot,private_snapshot,
    commercial_snapshot,created_by
  ) values (
    v_snapshot_id,p_quote_id,v_next_version,p_calculation_version,
    p_product_id,p_product_version_id,p_product_version_number,p_product_version_revision,
    p_pricing_policy_id,p_pricing_policy_version_id,p_pricing_policy_version_number,
    p_pricing_policy_version_revision,p_product_pricing_settings_revision,
    p_payment_rate_source,p_payment_term_revision,p_installation_settings_revision,
    p_costing_aggregation_version,p_effective_cost_at,p_commercial_quantity,p_installments,
    p_official_total_selling_price,p_minimum_allowed_total,p_total_selling_price,
    p_negotiation_private_snapshot,p_request_snapshot,p_public_result_snapshot,p_private_snapshot,
    p_commercial_snapshot,p_actor_id
  ) returning * into v_snapshot;

  update public.quotes
  set current_snapshot_id=v_snapshot_id,
      customer_name=btrim(p_customer_name),
      customer_phone=nullif(btrim(p_customer_phone),''),
      title=btrim(p_title),
      revision=revision+1,
      updated_at=now(),
      updated_by=p_actor_id
  where id=p_quote_id
  returning * into v_quote;

  insert into public.quote_events(
    quote_id,snapshot_id,event_type,actor_id,payload
  ) values (
    p_quote_id,v_snapshot_id,'SNAPSHOT_APPENDED',p_actor_id,
    jsonb_build_object(
      'quote_revision',v_quote.revision,
      'snapshot_version',v_snapshot.version_number,
      'commercial',p_commercial_snapshot,
      'pricing_mode',p_negotiation_private_snapshot->>'mode',
      'below_minimum_override',
        (p_negotiation_private_snapshot->>'belowMinimumOverride')::boolean
    )
  );

  return jsonb_build_object(
    'quote_id',v_quote.id,
    'quote_number',v_quote.quote_number,
    'status',v_quote.status,
    'revision',v_quote.revision,
    'snapshot_id',v_snapshot.id,
    'snapshot_version',v_snapshot.version_number,
    'saved_at',v_snapshot.created_at,
    'customer_name',v_quote.customer_name,
    'customer_phone',v_quote.customer_phone,
    'title',v_quote.title
  );
exception
  when unique_violation then raise exception 'QUOTE_VERSION_CONFLICT';
end;
$$;

create or replace function public.quote_get_current_secure(p_quote_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'quote', jsonb_build_object(
      'id',q.id,'quote_number',q.quote_number,'status',q.status,'revision',q.revision,
      'customer_name',q.customer_name,'customer_phone',q.customer_phone,'title',q.title,
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
      'official_total_selling_price',s.official_total_selling_price::text,
      'minimum_allowed_total',s.minimum_allowed_total::text,
      'total_selling_price',s.total_selling_price::text,
      'negotiation_private_snapshot',s.negotiation_private_snapshot,
      'request_snapshot',s.request_snapshot,
      'public_result_snapshot',s.public_result_snapshot,'private_snapshot',s.private_snapshot,
      'commercial_snapshot',s.commercial_snapshot,
      'created_at',s.created_at,'created_by',s.created_by
    )
  )
  from public.quotes q
  join public.quote_snapshots s
    on s.id=q.current_snapshot_id and s.quote_id=q.id
  where q.id=p_quote_id;
$$;

revoke all on function public.quote_create_with_snapshot_v3_secure(
  uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.quote_create_with_snapshot_v3_secure(
  uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb
) to service_role;

revoke all on function public.quote_append_snapshot_v3_secure(
  uuid,integer,uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.quote_append_snapshot_v3_secure(
  uuid,integer,uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb
) to service_role;

-- Re-assert the existing read RPC ACL after CREATE OR REPLACE.
revoke all on function public.quote_get_current_secure(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.quote_get_current_secure(uuid)
to service_role;

    or coalesce(p_negotiation_private_snapshot->'minimumAllowedTotal'->>'amount','') !~ '^[0-9]+\\.[0-9]{2}
    or coalesce(p_negotiation_private_snapshot->'finalTotal'->>'amount','') !~ '^\\d+\\.\\d{2}$'
    or coalesce(p_negotiation_private_snapshot->'adjustmentAmount'->>'amount','') !~ '^\\d+\\.\\d{2}$'
    or coalesce(p_negotiation_private_snapshot->>'belowMinimum','') not in ('true','false')
    or coalesce(p_negotiation_private_snapshot->>'belowMinimumOverride','') not in ('true','false') then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  v_snapshot_official :=
    (p_negotiation_private_snapshot->'officialTotal'->>'amount')::numeric;
  v_snapshot_minimum :=
    (p_negotiation_private_snapshot->'minimumAllowedTotal'->>'amount')::numeric;
  v_snapshot_final :=
    (p_negotiation_private_snapshot->'finalTotal'->>'amount')::numeric;
  v_adjustment_amount :=
    (p_negotiation_private_snapshot->'adjustmentAmount'->>'amount')::numeric;
  v_below_minimum :=
    (p_negotiation_private_snapshot->>'belowMinimum')::boolean;
  v_below_minimum_override :=
    (p_negotiation_private_snapshot->>'belowMinimumOverride')::boolean;

  if v_snapshot_official <> p_official_total_selling_price
    or v_snapshot_minimum <> p_minimum_allowed_total
    or v_snapshot_final <> p_total_selling_price then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  v_expected_below_minimum := p_total_selling_price < p_minimum_allowed_total;
  v_expected_adjustment_amount :=
    abs(p_official_total_selling_price - p_total_selling_price);
  v_expected_adjustment_kind :=
    case
      when p_total_selling_price < p_official_total_selling_price then 'DISCOUNT'
      when p_total_selling_price > p_official_total_selling_price then 'SURCHARGE'
      else 'NONE'
    end;

  if v_adjustment_kind is distinct from v_expected_adjustment_kind
    or v_adjustment_amount <> v_expected_adjustment_amount
    or v_below_minimum is distinct from v_expected_below_minimum then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  if v_mode = 'OFFICIAL' then
    if p_total_selling_price <> p_official_total_selling_price
      or v_adjustment_kind <> 'NONE'
      or v_adjustment_amount <> 0
      or v_below_minimum
      or v_below_minimum_override
      or v_reason is not null then
      raise exception 'INVALID_QUOTE_NEGOTIATION';
    end if;
    return;
  end if;

  if v_mode <> 'MANAGER_FINAL_PRICE' then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  select case
    when p.role='admin' then 'gerente'
    when p.role='consultor' then 'consultor_vendas'
    else p.role
  end
  into v_role
  from public.profiles p
  where p.id=p_actor_id;

  if v_role is distinct from 'gerente' then
    raise exception 'QUOTE_NEGOTIATION_FORBIDDEN';
  end if;

  if char_length(btrim(coalesce(v_reason,''))) < 5
    or char_length(btrim(coalesce(v_reason,''))) > 500 then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  if v_expected_below_minimum is distinct from v_below_minimum_override then
    raise exception 'BELOW_MINIMUM_OVERRIDE_REQUIRED';
  end if;
end;
$$;

revoke all on function public.quote_assert_negotiation_v1(
  uuid,numeric,numeric,numeric,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.quote_assert_negotiation_v1(
  uuid,numeric,numeric,numeric,jsonb
) to service_role;

create function public.quote_create_with_snapshot_v3_secure(
  p_actor_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_title text,
  p_commercial_snapshot jsonb,
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
  p_official_total_selling_price numeric,
  p_minimum_allowed_total numeric,
  p_total_selling_price numeric,
  p_negotiation_private_snapshot jsonb,
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
  perform public.quote_assert_negotiation_v1(
    p_actor_id,
    p_official_total_selling_price,
    p_minimum_allowed_total,
    p_total_selling_price,
    p_negotiation_private_snapshot
  );

  insert into public.quotes(
    id,status,revision,current_snapshot_id,
    customer_name,customer_phone,title,
    created_by,updated_by
  ) values (
    v_quote_id,'DRAFT',1,v_snapshot_id,
    btrim(p_customer_name),nullif(btrim(p_customer_phone),''),
    btrim(p_title),p_actor_id,p_actor_id
  ) returning * into v_quote;

  insert into public.quote_snapshots(
    id,quote_id,version_number,calculation_version,
    product_id,product_version_id,product_version_number,product_version_revision,
    pricing_policy_id,pricing_policy_version_id,pricing_policy_version_number,
    pricing_policy_version_revision,product_pricing_settings_revision,
    payment_rate_source,payment_term_revision,installation_settings_revision,
    costing_aggregation_version,effective_cost_at,commercial_quantity,installments,
    official_total_selling_price,minimum_allowed_total,total_selling_price,
    negotiation_private_snapshot,request_snapshot,public_result_snapshot,private_snapshot,
    commercial_snapshot,created_by
  ) values (
    v_snapshot_id,v_quote_id,1,p_calculation_version,
    p_product_id,p_product_version_id,p_product_version_number,p_product_version_revision,
    p_pricing_policy_id,p_pricing_policy_version_id,p_pricing_policy_version_number,
    p_pricing_policy_version_revision,p_product_pricing_settings_revision,
    p_payment_rate_source,p_payment_term_revision,p_installation_settings_revision,
    p_costing_aggregation_version,p_effective_cost_at,p_commercial_quantity,p_installments,
    p_official_total_selling_price,p_minimum_allowed_total,p_total_selling_price,
    p_negotiation_private_snapshot,p_request_snapshot,p_public_result_snapshot,p_private_snapshot,
    p_commercial_snapshot,p_actor_id
  ) returning * into v_snapshot;

  insert into public.quote_events(
    quote_id,snapshot_id,event_type,actor_id,payload
  ) values (
    v_quote_id,v_snapshot_id,'QUOTE_CREATED',p_actor_id,
    jsonb_build_object(
      'quote_revision',1,
      'snapshot_version',1,
      'commercial',p_commercial_snapshot,
      'pricing_mode',p_negotiation_private_snapshot->>'mode',
      'below_minimum_override',
        (p_negotiation_private_snapshot->>'belowMinimumOverride')::boolean
    )
  );

  return jsonb_build_object(
    'quote_id',v_quote.id,
    'quote_number',v_quote.quote_number,
    'status',v_quote.status,
    'revision',v_quote.revision,
    'snapshot_id',v_snapshot.id,
    'snapshot_version',v_snapshot.version_number,
    'saved_at',v_snapshot.created_at,
    'customer_name',v_quote.customer_name,
    'customer_phone',v_quote.customer_phone,
    'title',v_quote.title
  );
end;
$$;

create function public.quote_append_snapshot_v3_secure(
  p_quote_id uuid,
  p_expected_revision integer,
  p_actor_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_title text,
  p_commercial_snapshot jsonb,
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
  p_official_total_selling_price numeric,
  p_minimum_allowed_total numeric,
  p_total_selling_price numeric,
  p_negotiation_private_snapshot jsonb,
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
  perform public.quote_assert_negotiation_v1(
    p_actor_id,
    p_official_total_selling_price,
    p_minimum_allowed_total,
    p_total_selling_price,
    p_negotiation_private_snapshot
  );

  select * into v_quote
  from public.quotes
  where id=p_quote_id
  for update;

  if not found then raise exception 'QUOTE_NOT_FOUND'; end if;
  if v_quote.revision <> p_expected_revision then raise exception 'QUOTE_REVISION_CONFLICT'; end if;
  if v_quote.status <> 'DRAFT' then raise exception 'QUOTE_STATE_CONFLICT'; end if;

  select coalesce(max(version_number),0)+1
  into v_next_version
  from public.quote_snapshots
  where quote_id=p_quote_id;

  insert into public.quote_snapshots(
    id,quote_id,version_number,calculation_version,
    product_id,product_version_id,product_version_number,product_version_revision,
    pricing_policy_id,pricing_policy_version_id,pricing_policy_version_number,
    pricing_policy_version_revision,product_pricing_settings_revision,
    payment_rate_source,payment_term_revision,installation_settings_revision,
    costing_aggregation_version,effective_cost_at,commercial_quantity,installments,
    official_total_selling_price,minimum_allowed_total,total_selling_price,
    negotiation_private_snapshot,request_snapshot,public_result_snapshot,private_snapshot,
    commercial_snapshot,created_by
  ) values (
    v_snapshot_id,p_quote_id,v_next_version,p_calculation_version,
    p_product_id,p_product_version_id,p_product_version_number,p_product_version_revision,
    p_pricing_policy_id,p_pricing_policy_version_id,p_pricing_policy_version_number,
    p_pricing_policy_version_revision,p_product_pricing_settings_revision,
    p_payment_rate_source,p_payment_term_revision,p_installation_settings_revision,
    p_costing_aggregation_version,p_effective_cost_at,p_commercial_quantity,p_installments,
    p_official_total_selling_price,p_minimum_allowed_total,p_total_selling_price,
    p_negotiation_private_snapshot,p_request_snapshot,p_public_result_snapshot,p_private_snapshot,
    p_commercial_snapshot,p_actor_id
  ) returning * into v_snapshot;

  update public.quotes
  set current_snapshot_id=v_snapshot_id,
      customer_name=btrim(p_customer_name),
      customer_phone=nullif(btrim(p_customer_phone),''),
      title=btrim(p_title),
      revision=revision+1,
      updated_at=now(),
      updated_by=p_actor_id
  where id=p_quote_id
  returning * into v_quote;

  insert into public.quote_events(
    quote_id,snapshot_id,event_type,actor_id,payload
  ) values (
    p_quote_id,v_snapshot_id,'SNAPSHOT_APPENDED',p_actor_id,
    jsonb_build_object(
      'quote_revision',v_quote.revision,
      'snapshot_version',v_snapshot.version_number,
      'commercial',p_commercial_snapshot,
      'pricing_mode',p_negotiation_private_snapshot->>'mode',
      'below_minimum_override',
        (p_negotiation_private_snapshot->>'belowMinimumOverride')::boolean
    )
  );

  return jsonb_build_object(
    'quote_id',v_quote.id,
    'quote_number',v_quote.quote_number,
    'status',v_quote.status,
    'revision',v_quote.revision,
    'snapshot_id',v_snapshot.id,
    'snapshot_version',v_snapshot.version_number,
    'saved_at',v_snapshot.created_at,
    'customer_name',v_quote.customer_name,
    'customer_phone',v_quote.customer_phone,
    'title',v_quote.title
  );
exception
  when unique_violation then raise exception 'QUOTE_VERSION_CONFLICT';
end;
$$;

create or replace function public.quote_get_current_secure(p_quote_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'quote', jsonb_build_object(
      'id',q.id,'quote_number',q.quote_number,'status',q.status,'revision',q.revision,
      'customer_name',q.customer_name,'customer_phone',q.customer_phone,'title',q.title,
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
      'official_total_selling_price',s.official_total_selling_price::text,
      'minimum_allowed_total',s.minimum_allowed_total::text,
      'total_selling_price',s.total_selling_price::text,
      'negotiation_private_snapshot',s.negotiation_private_snapshot,
      'request_snapshot',s.request_snapshot,
      'public_result_snapshot',s.public_result_snapshot,'private_snapshot',s.private_snapshot,
      'commercial_snapshot',s.commercial_snapshot,
      'created_at',s.created_at,'created_by',s.created_by
    )
  )
  from public.quotes q
  join public.quote_snapshots s
    on s.id=q.current_snapshot_id and s.quote_id=q.id
  where q.id=p_quote_id;
$$;

revoke all on function public.quote_create_with_snapshot_v3_secure(
  uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.quote_create_with_snapshot_v3_secure(
  uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb
) to service_role;

revoke all on function public.quote_append_snapshot_v3_secure(
  uuid,integer,uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.quote_append_snapshot_v3_secure(
  uuid,integer,uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb
) to service_role;

-- Re-assert the existing read RPC ACL after CREATE OR REPLACE.
revoke all on function public.quote_get_current_secure(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.quote_get_current_secure(uuid)
to service_role;

    or coalesce(p_negotiation_private_snapshot->'finalTotal'->>'amount','') !~ '^[0-9]+\\.[0-9]{2}
    or coalesce(p_negotiation_private_snapshot->'adjustmentAmount'->>'amount','') !~ '^\\d+\\.\\d{2}$'
    or coalesce(p_negotiation_private_snapshot->>'belowMinimum','') not in ('true','false')
    or coalesce(p_negotiation_private_snapshot->>'belowMinimumOverride','') not in ('true','false') then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  v_snapshot_official :=
    (p_negotiation_private_snapshot->'officialTotal'->>'amount')::numeric;
  v_snapshot_minimum :=
    (p_negotiation_private_snapshot->'minimumAllowedTotal'->>'amount')::numeric;
  v_snapshot_final :=
    (p_negotiation_private_snapshot->'finalTotal'->>'amount')::numeric;
  v_adjustment_amount :=
    (p_negotiation_private_snapshot->'adjustmentAmount'->>'amount')::numeric;
  v_below_minimum :=
    (p_negotiation_private_snapshot->>'belowMinimum')::boolean;
  v_below_minimum_override :=
    (p_negotiation_private_snapshot->>'belowMinimumOverride')::boolean;

  if v_snapshot_official <> p_official_total_selling_price
    or v_snapshot_minimum <> p_minimum_allowed_total
    or v_snapshot_final <> p_total_selling_price then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  v_expected_below_minimum := p_total_selling_price < p_minimum_allowed_total;
  v_expected_adjustment_amount :=
    abs(p_official_total_selling_price - p_total_selling_price);
  v_expected_adjustment_kind :=
    case
      when p_total_selling_price < p_official_total_selling_price then 'DISCOUNT'
      when p_total_selling_price > p_official_total_selling_price then 'SURCHARGE'
      else 'NONE'
    end;

  if v_adjustment_kind is distinct from v_expected_adjustment_kind
    or v_adjustment_amount <> v_expected_adjustment_amount
    or v_below_minimum is distinct from v_expected_below_minimum then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  if v_mode = 'OFFICIAL' then
    if p_total_selling_price <> p_official_total_selling_price
      or v_adjustment_kind <> 'NONE'
      or v_adjustment_amount <> 0
      or v_below_minimum
      or v_below_minimum_override
      or v_reason is not null then
      raise exception 'INVALID_QUOTE_NEGOTIATION';
    end if;
    return;
  end if;

  if v_mode <> 'MANAGER_FINAL_PRICE' then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  select case
    when p.role='admin' then 'gerente'
    when p.role='consultor' then 'consultor_vendas'
    else p.role
  end
  into v_role
  from public.profiles p
  where p.id=p_actor_id;

  if v_role is distinct from 'gerente' then
    raise exception 'QUOTE_NEGOTIATION_FORBIDDEN';
  end if;

  if char_length(btrim(coalesce(v_reason,''))) < 5
    or char_length(btrim(coalesce(v_reason,''))) > 500 then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  if v_expected_below_minimum is distinct from v_below_minimum_override then
    raise exception 'BELOW_MINIMUM_OVERRIDE_REQUIRED';
  end if;
end;
$$;

revoke all on function public.quote_assert_negotiation_v1(
  uuid,numeric,numeric,numeric,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.quote_assert_negotiation_v1(
  uuid,numeric,numeric,numeric,jsonb
) to service_role;

create function public.quote_create_with_snapshot_v3_secure(
  p_actor_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_title text,
  p_commercial_snapshot jsonb,
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
  p_official_total_selling_price numeric,
  p_minimum_allowed_total numeric,
  p_total_selling_price numeric,
  p_negotiation_private_snapshot jsonb,
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
  perform public.quote_assert_negotiation_v1(
    p_actor_id,
    p_official_total_selling_price,
    p_minimum_allowed_total,
    p_total_selling_price,
    p_negotiation_private_snapshot
  );

  insert into public.quotes(
    id,status,revision,current_snapshot_id,
    customer_name,customer_phone,title,
    created_by,updated_by
  ) values (
    v_quote_id,'DRAFT',1,v_snapshot_id,
    btrim(p_customer_name),nullif(btrim(p_customer_phone),''),
    btrim(p_title),p_actor_id,p_actor_id
  ) returning * into v_quote;

  insert into public.quote_snapshots(
    id,quote_id,version_number,calculation_version,
    product_id,product_version_id,product_version_number,product_version_revision,
    pricing_policy_id,pricing_policy_version_id,pricing_policy_version_number,
    pricing_policy_version_revision,product_pricing_settings_revision,
    payment_rate_source,payment_term_revision,installation_settings_revision,
    costing_aggregation_version,effective_cost_at,commercial_quantity,installments,
    official_total_selling_price,minimum_allowed_total,total_selling_price,
    negotiation_private_snapshot,request_snapshot,public_result_snapshot,private_snapshot,
    commercial_snapshot,created_by
  ) values (
    v_snapshot_id,v_quote_id,1,p_calculation_version,
    p_product_id,p_product_version_id,p_product_version_number,p_product_version_revision,
    p_pricing_policy_id,p_pricing_policy_version_id,p_pricing_policy_version_number,
    p_pricing_policy_version_revision,p_product_pricing_settings_revision,
    p_payment_rate_source,p_payment_term_revision,p_installation_settings_revision,
    p_costing_aggregation_version,p_effective_cost_at,p_commercial_quantity,p_installments,
    p_official_total_selling_price,p_minimum_allowed_total,p_total_selling_price,
    p_negotiation_private_snapshot,p_request_snapshot,p_public_result_snapshot,p_private_snapshot,
    p_commercial_snapshot,p_actor_id
  ) returning * into v_snapshot;

  insert into public.quote_events(
    quote_id,snapshot_id,event_type,actor_id,payload
  ) values (
    v_quote_id,v_snapshot_id,'QUOTE_CREATED',p_actor_id,
    jsonb_build_object(
      'quote_revision',1,
      'snapshot_version',1,
      'commercial',p_commercial_snapshot,
      'pricing_mode',p_negotiation_private_snapshot->>'mode',
      'below_minimum_override',
        (p_negotiation_private_snapshot->>'belowMinimumOverride')::boolean
    )
  );

  return jsonb_build_object(
    'quote_id',v_quote.id,
    'quote_number',v_quote.quote_number,
    'status',v_quote.status,
    'revision',v_quote.revision,
    'snapshot_id',v_snapshot.id,
    'snapshot_version',v_snapshot.version_number,
    'saved_at',v_snapshot.created_at,
    'customer_name',v_quote.customer_name,
    'customer_phone',v_quote.customer_phone,
    'title',v_quote.title
  );
end;
$$;

create function public.quote_append_snapshot_v3_secure(
  p_quote_id uuid,
  p_expected_revision integer,
  p_actor_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_title text,
  p_commercial_snapshot jsonb,
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
  p_official_total_selling_price numeric,
  p_minimum_allowed_total numeric,
  p_total_selling_price numeric,
  p_negotiation_private_snapshot jsonb,
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
  perform public.quote_assert_negotiation_v1(
    p_actor_id,
    p_official_total_selling_price,
    p_minimum_allowed_total,
    p_total_selling_price,
    p_negotiation_private_snapshot
  );

  select * into v_quote
  from public.quotes
  where id=p_quote_id
  for update;

  if not found then raise exception 'QUOTE_NOT_FOUND'; end if;
  if v_quote.revision <> p_expected_revision then raise exception 'QUOTE_REVISION_CONFLICT'; end if;
  if v_quote.status <> 'DRAFT' then raise exception 'QUOTE_STATE_CONFLICT'; end if;

  select coalesce(max(version_number),0)+1
  into v_next_version
  from public.quote_snapshots
  where quote_id=p_quote_id;

  insert into public.quote_snapshots(
    id,quote_id,version_number,calculation_version,
    product_id,product_version_id,product_version_number,product_version_revision,
    pricing_policy_id,pricing_policy_version_id,pricing_policy_version_number,
    pricing_policy_version_revision,product_pricing_settings_revision,
    payment_rate_source,payment_term_revision,installation_settings_revision,
    costing_aggregation_version,effective_cost_at,commercial_quantity,installments,
    official_total_selling_price,minimum_allowed_total,total_selling_price,
    negotiation_private_snapshot,request_snapshot,public_result_snapshot,private_snapshot,
    commercial_snapshot,created_by
  ) values (
    v_snapshot_id,p_quote_id,v_next_version,p_calculation_version,
    p_product_id,p_product_version_id,p_product_version_number,p_product_version_revision,
    p_pricing_policy_id,p_pricing_policy_version_id,p_pricing_policy_version_number,
    p_pricing_policy_version_revision,p_product_pricing_settings_revision,
    p_payment_rate_source,p_payment_term_revision,p_installation_settings_revision,
    p_costing_aggregation_version,p_effective_cost_at,p_commercial_quantity,p_installments,
    p_official_total_selling_price,p_minimum_allowed_total,p_total_selling_price,
    p_negotiation_private_snapshot,p_request_snapshot,p_public_result_snapshot,p_private_snapshot,
    p_commercial_snapshot,p_actor_id
  ) returning * into v_snapshot;

  update public.quotes
  set current_snapshot_id=v_snapshot_id,
      customer_name=btrim(p_customer_name),
      customer_phone=nullif(btrim(p_customer_phone),''),
      title=btrim(p_title),
      revision=revision+1,
      updated_at=now(),
      updated_by=p_actor_id
  where id=p_quote_id
  returning * into v_quote;

  insert into public.quote_events(
    quote_id,snapshot_id,event_type,actor_id,payload
  ) values (
    p_quote_id,v_snapshot_id,'SNAPSHOT_APPENDED',p_actor_id,
    jsonb_build_object(
      'quote_revision',v_quote.revision,
      'snapshot_version',v_snapshot.version_number,
      'commercial',p_commercial_snapshot,
      'pricing_mode',p_negotiation_private_snapshot->>'mode',
      'below_minimum_override',
        (p_negotiation_private_snapshot->>'belowMinimumOverride')::boolean
    )
  );

  return jsonb_build_object(
    'quote_id',v_quote.id,
    'quote_number',v_quote.quote_number,
    'status',v_quote.status,
    'revision',v_quote.revision,
    'snapshot_id',v_snapshot.id,
    'snapshot_version',v_snapshot.version_number,
    'saved_at',v_snapshot.created_at,
    'customer_name',v_quote.customer_name,
    'customer_phone',v_quote.customer_phone,
    'title',v_quote.title
  );
exception
  when unique_violation then raise exception 'QUOTE_VERSION_CONFLICT';
end;
$$;

create or replace function public.quote_get_current_secure(p_quote_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'quote', jsonb_build_object(
      'id',q.id,'quote_number',q.quote_number,'status',q.status,'revision',q.revision,
      'customer_name',q.customer_name,'customer_phone',q.customer_phone,'title',q.title,
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
      'official_total_selling_price',s.official_total_selling_price::text,
      'minimum_allowed_total',s.minimum_allowed_total::text,
      'total_selling_price',s.total_selling_price::text,
      'negotiation_private_snapshot',s.negotiation_private_snapshot,
      'request_snapshot',s.request_snapshot,
      'public_result_snapshot',s.public_result_snapshot,'private_snapshot',s.private_snapshot,
      'commercial_snapshot',s.commercial_snapshot,
      'created_at',s.created_at,'created_by',s.created_by
    )
  )
  from public.quotes q
  join public.quote_snapshots s
    on s.id=q.current_snapshot_id and s.quote_id=q.id
  where q.id=p_quote_id;
$$;

revoke all on function public.quote_create_with_snapshot_v3_secure(
  uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.quote_create_with_snapshot_v3_secure(
  uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb
) to service_role;

revoke all on function public.quote_append_snapshot_v3_secure(
  uuid,integer,uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.quote_append_snapshot_v3_secure(
  uuid,integer,uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb
) to service_role;

-- Re-assert the existing read RPC ACL after CREATE OR REPLACE.
revoke all on function public.quote_get_current_secure(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.quote_get_current_secure(uuid)
to service_role;

    or coalesce(p_negotiation_private_snapshot->'adjustmentAmount'->>'amount','') !~ '^[0-9]+\\.[0-9]{2}
    or coalesce(p_negotiation_private_snapshot->>'belowMinimum','') not in ('true','false')
    or coalesce(p_negotiation_private_snapshot->>'belowMinimumOverride','') not in ('true','false') then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  v_snapshot_official :=
    (p_negotiation_private_snapshot->'officialTotal'->>'amount')::numeric;
  v_snapshot_minimum :=
    (p_negotiation_private_snapshot->'minimumAllowedTotal'->>'amount')::numeric;
  v_snapshot_final :=
    (p_negotiation_private_snapshot->'finalTotal'->>'amount')::numeric;
  v_adjustment_amount :=
    (p_negotiation_private_snapshot->'adjustmentAmount'->>'amount')::numeric;
  v_below_minimum :=
    (p_negotiation_private_snapshot->>'belowMinimum')::boolean;
  v_below_minimum_override :=
    (p_negotiation_private_snapshot->>'belowMinimumOverride')::boolean;

  if v_snapshot_official <> p_official_total_selling_price
    or v_snapshot_minimum <> p_minimum_allowed_total
    or v_snapshot_final <> p_total_selling_price then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  v_expected_below_minimum := p_total_selling_price < p_minimum_allowed_total;
  v_expected_adjustment_amount :=
    abs(p_official_total_selling_price - p_total_selling_price);
  v_expected_adjustment_kind :=
    case
      when p_total_selling_price < p_official_total_selling_price then 'DISCOUNT'
      when p_total_selling_price > p_official_total_selling_price then 'SURCHARGE'
      else 'NONE'
    end;

  if v_adjustment_kind is distinct from v_expected_adjustment_kind
    or v_adjustment_amount <> v_expected_adjustment_amount
    or v_below_minimum is distinct from v_expected_below_minimum then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  if v_mode = 'OFFICIAL' then
    if p_total_selling_price <> p_official_total_selling_price
      or v_adjustment_kind <> 'NONE'
      or v_adjustment_amount <> 0
      or v_below_minimum
      or v_below_minimum_override
      or v_reason is not null then
      raise exception 'INVALID_QUOTE_NEGOTIATION';
    end if;
    return;
  end if;

  if v_mode <> 'MANAGER_FINAL_PRICE' then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  select case
    when p.role='admin' then 'gerente'
    when p.role='consultor' then 'consultor_vendas'
    else p.role
  end
  into v_role
  from public.profiles p
  where p.id=p_actor_id;

  if v_role is distinct from 'gerente' then
    raise exception 'QUOTE_NEGOTIATION_FORBIDDEN';
  end if;

  if char_length(btrim(coalesce(v_reason,''))) < 5
    or char_length(btrim(coalesce(v_reason,''))) > 500 then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  if v_expected_below_minimum is distinct from v_below_minimum_override then
    raise exception 'BELOW_MINIMUM_OVERRIDE_REQUIRED';
  end if;
end;
$$;

revoke all on function public.quote_assert_negotiation_v1(
  uuid,numeric,numeric,numeric,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.quote_assert_negotiation_v1(
  uuid,numeric,numeric,numeric,jsonb
) to service_role;

create function public.quote_create_with_snapshot_v3_secure(
  p_actor_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_title text,
  p_commercial_snapshot jsonb,
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
  p_official_total_selling_price numeric,
  p_minimum_allowed_total numeric,
  p_total_selling_price numeric,
  p_negotiation_private_snapshot jsonb,
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
  perform public.quote_assert_negotiation_v1(
    p_actor_id,
    p_official_total_selling_price,
    p_minimum_allowed_total,
    p_total_selling_price,
    p_negotiation_private_snapshot
  );

  insert into public.quotes(
    id,status,revision,current_snapshot_id,
    customer_name,customer_phone,title,
    created_by,updated_by
  ) values (
    v_quote_id,'DRAFT',1,v_snapshot_id,
    btrim(p_customer_name),nullif(btrim(p_customer_phone),''),
    btrim(p_title),p_actor_id,p_actor_id
  ) returning * into v_quote;

  insert into public.quote_snapshots(
    id,quote_id,version_number,calculation_version,
    product_id,product_version_id,product_version_number,product_version_revision,
    pricing_policy_id,pricing_policy_version_id,pricing_policy_version_number,
    pricing_policy_version_revision,product_pricing_settings_revision,
    payment_rate_source,payment_term_revision,installation_settings_revision,
    costing_aggregation_version,effective_cost_at,commercial_quantity,installments,
    official_total_selling_price,minimum_allowed_total,total_selling_price,
    negotiation_private_snapshot,request_snapshot,public_result_snapshot,private_snapshot,
    commercial_snapshot,created_by
  ) values (
    v_snapshot_id,v_quote_id,1,p_calculation_version,
    p_product_id,p_product_version_id,p_product_version_number,p_product_version_revision,
    p_pricing_policy_id,p_pricing_policy_version_id,p_pricing_policy_version_number,
    p_pricing_policy_version_revision,p_product_pricing_settings_revision,
    p_payment_rate_source,p_payment_term_revision,p_installation_settings_revision,
    p_costing_aggregation_version,p_effective_cost_at,p_commercial_quantity,p_installments,
    p_official_total_selling_price,p_minimum_allowed_total,p_total_selling_price,
    p_negotiation_private_snapshot,p_request_snapshot,p_public_result_snapshot,p_private_snapshot,
    p_commercial_snapshot,p_actor_id
  ) returning * into v_snapshot;

  insert into public.quote_events(
    quote_id,snapshot_id,event_type,actor_id,payload
  ) values (
    v_quote_id,v_snapshot_id,'QUOTE_CREATED',p_actor_id,
    jsonb_build_object(
      'quote_revision',1,
      'snapshot_version',1,
      'commercial',p_commercial_snapshot,
      'pricing_mode',p_negotiation_private_snapshot->>'mode',
      'below_minimum_override',
        (p_negotiation_private_snapshot->>'belowMinimumOverride')::boolean
    )
  );

  return jsonb_build_object(
    'quote_id',v_quote.id,
    'quote_number',v_quote.quote_number,
    'status',v_quote.status,
    'revision',v_quote.revision,
    'snapshot_id',v_snapshot.id,
    'snapshot_version',v_snapshot.version_number,
    'saved_at',v_snapshot.created_at,
    'customer_name',v_quote.customer_name,
    'customer_phone',v_quote.customer_phone,
    'title',v_quote.title
  );
end;
$$;

create function public.quote_append_snapshot_v3_secure(
  p_quote_id uuid,
  p_expected_revision integer,
  p_actor_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_title text,
  p_commercial_snapshot jsonb,
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
  p_official_total_selling_price numeric,
  p_minimum_allowed_total numeric,
  p_total_selling_price numeric,
  p_negotiation_private_snapshot jsonb,
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
  perform public.quote_assert_negotiation_v1(
    p_actor_id,
    p_official_total_selling_price,
    p_minimum_allowed_total,
    p_total_selling_price,
    p_negotiation_private_snapshot
  );

  select * into v_quote
  from public.quotes
  where id=p_quote_id
  for update;

  if not found then raise exception 'QUOTE_NOT_FOUND'; end if;
  if v_quote.revision <> p_expected_revision then raise exception 'QUOTE_REVISION_CONFLICT'; end if;
  if v_quote.status <> 'DRAFT' then raise exception 'QUOTE_STATE_CONFLICT'; end if;

  select coalesce(max(version_number),0)+1
  into v_next_version
  from public.quote_snapshots
  where quote_id=p_quote_id;

  insert into public.quote_snapshots(
    id,quote_id,version_number,calculation_version,
    product_id,product_version_id,product_version_number,product_version_revision,
    pricing_policy_id,pricing_policy_version_id,pricing_policy_version_number,
    pricing_policy_version_revision,product_pricing_settings_revision,
    payment_rate_source,payment_term_revision,installation_settings_revision,
    costing_aggregation_version,effective_cost_at,commercial_quantity,installments,
    official_total_selling_price,minimum_allowed_total,total_selling_price,
    negotiation_private_snapshot,request_snapshot,public_result_snapshot,private_snapshot,
    commercial_snapshot,created_by
  ) values (
    v_snapshot_id,p_quote_id,v_next_version,p_calculation_version,
    p_product_id,p_product_version_id,p_product_version_number,p_product_version_revision,
    p_pricing_policy_id,p_pricing_policy_version_id,p_pricing_policy_version_number,
    p_pricing_policy_version_revision,p_product_pricing_settings_revision,
    p_payment_rate_source,p_payment_term_revision,p_installation_settings_revision,
    p_costing_aggregation_version,p_effective_cost_at,p_commercial_quantity,p_installments,
    p_official_total_selling_price,p_minimum_allowed_total,p_total_selling_price,
    p_negotiation_private_snapshot,p_request_snapshot,p_public_result_snapshot,p_private_snapshot,
    p_commercial_snapshot,p_actor_id
  ) returning * into v_snapshot;

  update public.quotes
  set current_snapshot_id=v_snapshot_id,
      customer_name=btrim(p_customer_name),
      customer_phone=nullif(btrim(p_customer_phone),''),
      title=btrim(p_title),
      revision=revision+1,
      updated_at=now(),
      updated_by=p_actor_id
  where id=p_quote_id
  returning * into v_quote;

  insert into public.quote_events(
    quote_id,snapshot_id,event_type,actor_id,payload
  ) values (
    p_quote_id,v_snapshot_id,'SNAPSHOT_APPENDED',p_actor_id,
    jsonb_build_object(
      'quote_revision',v_quote.revision,
      'snapshot_version',v_snapshot.version_number,
      'commercial',p_commercial_snapshot,
      'pricing_mode',p_negotiation_private_snapshot->>'mode',
      'below_minimum_override',
        (p_negotiation_private_snapshot->>'belowMinimumOverride')::boolean
    )
  );

  return jsonb_build_object(
    'quote_id',v_quote.id,
    'quote_number',v_quote.quote_number,
    'status',v_quote.status,
    'revision',v_quote.revision,
    'snapshot_id',v_snapshot.id,
    'snapshot_version',v_snapshot.version_number,
    'saved_at',v_snapshot.created_at,
    'customer_name',v_quote.customer_name,
    'customer_phone',v_quote.customer_phone,
    'title',v_quote.title
  );
exception
  when unique_violation then raise exception 'QUOTE_VERSION_CONFLICT';
end;
$$;

create or replace function public.quote_get_current_secure(p_quote_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'quote', jsonb_build_object(
      'id',q.id,'quote_number',q.quote_number,'status',q.status,'revision',q.revision,
      'customer_name',q.customer_name,'customer_phone',q.customer_phone,'title',q.title,
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
      'official_total_selling_price',s.official_total_selling_price::text,
      'minimum_allowed_total',s.minimum_allowed_total::text,
      'total_selling_price',s.total_selling_price::text,
      'negotiation_private_snapshot',s.negotiation_private_snapshot,
      'request_snapshot',s.request_snapshot,
      'public_result_snapshot',s.public_result_snapshot,'private_snapshot',s.private_snapshot,
      'commercial_snapshot',s.commercial_snapshot,
      'created_at',s.created_at,'created_by',s.created_by
    )
  )
  from public.quotes q
  join public.quote_snapshots s
    on s.id=q.current_snapshot_id and s.quote_id=q.id
  where q.id=p_quote_id;
$$;

revoke all on function public.quote_create_with_snapshot_v3_secure(
  uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.quote_create_with_snapshot_v3_secure(
  uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb
) to service_role;

revoke all on function public.quote_append_snapshot_v3_secure(
  uuid,integer,uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.quote_append_snapshot_v3_secure(
  uuid,integer,uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb
) to service_role;

-- Re-assert the existing read RPC ACL after CREATE OR REPLACE.
revoke all on function public.quote_get_current_secure(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.quote_get_current_secure(uuid)
to service_role;

    or coalesce(p_negotiation_private_snapshot->>'belowMinimum','') not in ('true','false')
    or coalesce(p_negotiation_private_snapshot->>'belowMinimumOverride','') not in ('true','false') then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  v_snapshot_official :=
    (p_negotiation_private_snapshot->'officialTotal'->>'amount')::numeric;
  v_snapshot_minimum :=
    (p_negotiation_private_snapshot->'minimumAllowedTotal'->>'amount')::numeric;
  v_snapshot_final :=
    (p_negotiation_private_snapshot->'finalTotal'->>'amount')::numeric;
  v_adjustment_amount :=
    (p_negotiation_private_snapshot->'adjustmentAmount'->>'amount')::numeric;
  v_below_minimum :=
    (p_negotiation_private_snapshot->>'belowMinimum')::boolean;
  v_below_minimum_override :=
    (p_negotiation_private_snapshot->>'belowMinimumOverride')::boolean;

  if v_snapshot_official <> p_official_total_selling_price
    or v_snapshot_minimum <> p_minimum_allowed_total
    or v_snapshot_final <> p_total_selling_price then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  v_expected_below_minimum := p_total_selling_price < p_minimum_allowed_total;
  v_expected_adjustment_amount :=
    abs(p_official_total_selling_price - p_total_selling_price);
  v_expected_adjustment_kind :=
    case
      when p_total_selling_price < p_official_total_selling_price then 'DISCOUNT'
      when p_total_selling_price > p_official_total_selling_price then 'SURCHARGE'
      else 'NONE'
    end;

  if v_adjustment_kind is distinct from v_expected_adjustment_kind
    or v_adjustment_amount <> v_expected_adjustment_amount
    or v_below_minimum is distinct from v_expected_below_minimum then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  if v_mode = 'OFFICIAL' then
    if p_total_selling_price <> p_official_total_selling_price
      or v_adjustment_kind <> 'NONE'
      or v_adjustment_amount <> 0
      or v_below_minimum
      or v_below_minimum_override
      or v_reason is not null then
      raise exception 'INVALID_QUOTE_NEGOTIATION';
    end if;
    return;
  end if;

  if v_mode <> 'MANAGER_FINAL_PRICE' then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  select case
    when p.role='admin' then 'gerente'
    when p.role='consultor' then 'consultor_vendas'
    else p.role
  end
  into v_role
  from public.profiles p
  where p.id=p_actor_id;

  if v_role is distinct from 'gerente' then
    raise exception 'QUOTE_NEGOTIATION_FORBIDDEN';
  end if;

  if char_length(btrim(coalesce(v_reason,''))) < 5
    or char_length(btrim(coalesce(v_reason,''))) > 500 then
    raise exception 'INVALID_QUOTE_NEGOTIATION';
  end if;

  if v_expected_below_minimum is distinct from v_below_minimum_override then
    raise exception 'BELOW_MINIMUM_OVERRIDE_REQUIRED';
  end if;
end;
$$;

revoke all on function public.quote_assert_negotiation_v1(
  uuid,numeric,numeric,numeric,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.quote_assert_negotiation_v1(
  uuid,numeric,numeric,numeric,jsonb
) to service_role;

create function public.quote_create_with_snapshot_v3_secure(
  p_actor_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_title text,
  p_commercial_snapshot jsonb,
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
  p_official_total_selling_price numeric,
  p_minimum_allowed_total numeric,
  p_total_selling_price numeric,
  p_negotiation_private_snapshot jsonb,
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
  perform public.quote_assert_negotiation_v1(
    p_actor_id,
    p_official_total_selling_price,
    p_minimum_allowed_total,
    p_total_selling_price,
    p_negotiation_private_snapshot
  );

  insert into public.quotes(
    id,status,revision,current_snapshot_id,
    customer_name,customer_phone,title,
    created_by,updated_by
  ) values (
    v_quote_id,'DRAFT',1,v_snapshot_id,
    btrim(p_customer_name),nullif(btrim(p_customer_phone),''),
    btrim(p_title),p_actor_id,p_actor_id
  ) returning * into v_quote;

  insert into public.quote_snapshots(
    id,quote_id,version_number,calculation_version,
    product_id,product_version_id,product_version_number,product_version_revision,
    pricing_policy_id,pricing_policy_version_id,pricing_policy_version_number,
    pricing_policy_version_revision,product_pricing_settings_revision,
    payment_rate_source,payment_term_revision,installation_settings_revision,
    costing_aggregation_version,effective_cost_at,commercial_quantity,installments,
    official_total_selling_price,minimum_allowed_total,total_selling_price,
    negotiation_private_snapshot,request_snapshot,public_result_snapshot,private_snapshot,
    commercial_snapshot,created_by
  ) values (
    v_snapshot_id,v_quote_id,1,p_calculation_version,
    p_product_id,p_product_version_id,p_product_version_number,p_product_version_revision,
    p_pricing_policy_id,p_pricing_policy_version_id,p_pricing_policy_version_number,
    p_pricing_policy_version_revision,p_product_pricing_settings_revision,
    p_payment_rate_source,p_payment_term_revision,p_installation_settings_revision,
    p_costing_aggregation_version,p_effective_cost_at,p_commercial_quantity,p_installments,
    p_official_total_selling_price,p_minimum_allowed_total,p_total_selling_price,
    p_negotiation_private_snapshot,p_request_snapshot,p_public_result_snapshot,p_private_snapshot,
    p_commercial_snapshot,p_actor_id
  ) returning * into v_snapshot;

  insert into public.quote_events(
    quote_id,snapshot_id,event_type,actor_id,payload
  ) values (
    v_quote_id,v_snapshot_id,'QUOTE_CREATED',p_actor_id,
    jsonb_build_object(
      'quote_revision',1,
      'snapshot_version',1,
      'commercial',p_commercial_snapshot,
      'pricing_mode',p_negotiation_private_snapshot->>'mode',
      'below_minimum_override',
        (p_negotiation_private_snapshot->>'belowMinimumOverride')::boolean
    )
  );

  return jsonb_build_object(
    'quote_id',v_quote.id,
    'quote_number',v_quote.quote_number,
    'status',v_quote.status,
    'revision',v_quote.revision,
    'snapshot_id',v_snapshot.id,
    'snapshot_version',v_snapshot.version_number,
    'saved_at',v_snapshot.created_at,
    'customer_name',v_quote.customer_name,
    'customer_phone',v_quote.customer_phone,
    'title',v_quote.title
  );
end;
$$;

create function public.quote_append_snapshot_v3_secure(
  p_quote_id uuid,
  p_expected_revision integer,
  p_actor_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_title text,
  p_commercial_snapshot jsonb,
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
  p_official_total_selling_price numeric,
  p_minimum_allowed_total numeric,
  p_total_selling_price numeric,
  p_negotiation_private_snapshot jsonb,
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
  perform public.quote_assert_negotiation_v1(
    p_actor_id,
    p_official_total_selling_price,
    p_minimum_allowed_total,
    p_total_selling_price,
    p_negotiation_private_snapshot
  );

  select * into v_quote
  from public.quotes
  where id=p_quote_id
  for update;

  if not found then raise exception 'QUOTE_NOT_FOUND'; end if;
  if v_quote.revision <> p_expected_revision then raise exception 'QUOTE_REVISION_CONFLICT'; end if;
  if v_quote.status <> 'DRAFT' then raise exception 'QUOTE_STATE_CONFLICT'; end if;

  select coalesce(max(version_number),0)+1
  into v_next_version
  from public.quote_snapshots
  where quote_id=p_quote_id;

  insert into public.quote_snapshots(
    id,quote_id,version_number,calculation_version,
    product_id,product_version_id,product_version_number,product_version_revision,
    pricing_policy_id,pricing_policy_version_id,pricing_policy_version_number,
    pricing_policy_version_revision,product_pricing_settings_revision,
    payment_rate_source,payment_term_revision,installation_settings_revision,
    costing_aggregation_version,effective_cost_at,commercial_quantity,installments,
    official_total_selling_price,minimum_allowed_total,total_selling_price,
    negotiation_private_snapshot,request_snapshot,public_result_snapshot,private_snapshot,
    commercial_snapshot,created_by
  ) values (
    v_snapshot_id,p_quote_id,v_next_version,p_calculation_version,
    p_product_id,p_product_version_id,p_product_version_number,p_product_version_revision,
    p_pricing_policy_id,p_pricing_policy_version_id,p_pricing_policy_version_number,
    p_pricing_policy_version_revision,p_product_pricing_settings_revision,
    p_payment_rate_source,p_payment_term_revision,p_installation_settings_revision,
    p_costing_aggregation_version,p_effective_cost_at,p_commercial_quantity,p_installments,
    p_official_total_selling_price,p_minimum_allowed_total,p_total_selling_price,
    p_negotiation_private_snapshot,p_request_snapshot,p_public_result_snapshot,p_private_snapshot,
    p_commercial_snapshot,p_actor_id
  ) returning * into v_snapshot;

  update public.quotes
  set current_snapshot_id=v_snapshot_id,
      customer_name=btrim(p_customer_name),
      customer_phone=nullif(btrim(p_customer_phone),''),
      title=btrim(p_title),
      revision=revision+1,
      updated_at=now(),
      updated_by=p_actor_id
  where id=p_quote_id
  returning * into v_quote;

  insert into public.quote_events(
    quote_id,snapshot_id,event_type,actor_id,payload
  ) values (
    p_quote_id,v_snapshot_id,'SNAPSHOT_APPENDED',p_actor_id,
    jsonb_build_object(
      'quote_revision',v_quote.revision,
      'snapshot_version',v_snapshot.version_number,
      'commercial',p_commercial_snapshot,
      'pricing_mode',p_negotiation_private_snapshot->>'mode',
      'below_minimum_override',
        (p_negotiation_private_snapshot->>'belowMinimumOverride')::boolean
    )
  );

  return jsonb_build_object(
    'quote_id',v_quote.id,
    'quote_number',v_quote.quote_number,
    'status',v_quote.status,
    'revision',v_quote.revision,
    'snapshot_id',v_snapshot.id,
    'snapshot_version',v_snapshot.version_number,
    'saved_at',v_snapshot.created_at,
    'customer_name',v_quote.customer_name,
    'customer_phone',v_quote.customer_phone,
    'title',v_quote.title
  );
exception
  when unique_violation then raise exception 'QUOTE_VERSION_CONFLICT';
end;
$$;

create or replace function public.quote_get_current_secure(p_quote_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'quote', jsonb_build_object(
      'id',q.id,'quote_number',q.quote_number,'status',q.status,'revision',q.revision,
      'customer_name',q.customer_name,'customer_phone',q.customer_phone,'title',q.title,
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
      'official_total_selling_price',s.official_total_selling_price::text,
      'minimum_allowed_total',s.minimum_allowed_total::text,
      'total_selling_price',s.total_selling_price::text,
      'negotiation_private_snapshot',s.negotiation_private_snapshot,
      'request_snapshot',s.request_snapshot,
      'public_result_snapshot',s.public_result_snapshot,'private_snapshot',s.private_snapshot,
      'commercial_snapshot',s.commercial_snapshot,
      'created_at',s.created_at,'created_by',s.created_by
    )
  )
  from public.quotes q
  join public.quote_snapshots s
    on s.id=q.current_snapshot_id and s.quote_id=q.id
  where q.id=p_quote_id;
$$;

revoke all on function public.quote_create_with_snapshot_v3_secure(
  uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.quote_create_with_snapshot_v3_secure(
  uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb
) to service_role;

revoke all on function public.quote_append_snapshot_v3_secure(
  uuid,integer,uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.quote_append_snapshot_v3_secure(
  uuid,integer,uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb
) to service_role;

-- Re-assert the existing read RPC ACL after CREATE OR REPLACE.
revoke all on function public.quote_get_current_secure(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.quote_get_current_secure(uuid)
to service_role;
