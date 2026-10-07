-- 18D Quote commercial identity and searchable central.

alter table public.quotes
  add column customer_name text not null default 'Cliente não informado',
  add column customer_phone text,
  add column title text not null default 'Orçamento sem título';

alter table public.quotes
  add constraint quotes_customer_name_valid
    check (char_length(btrim(customer_name)) between 1 and 160),
  add constraint quotes_customer_phone_valid
    check (
      customer_phone is null
      or char_length(btrim(customer_phone)) between 3 and 40
    ),
  add constraint quotes_title_valid
    check (char_length(btrim(title)) between 1 and 200);

alter table public.quote_snapshots
  add column commercial_snapshot jsonb not null default '{}'::jsonb;

alter table public.quote_snapshots
  add constraint quote_snapshots_commercial_object
    check (jsonb_typeof(commercial_snapshot) = 'object');

create index quotes_updated_idx
  on public.quotes(updated_at desc, quote_number desc);

create index quotes_created_by_updated_idx
  on public.quotes(created_by, updated_at desc, quote_number desc);

create function public.quote_create_with_snapshot_v2_secure(
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
    total_selling_price,request_snapshot,public_result_snapshot,private_snapshot,
    commercial_snapshot,created_by
  ) values (
    v_snapshot_id,v_quote_id,1,p_calculation_version,
    p_product_id,p_product_version_id,p_product_version_number,p_product_version_revision,
    p_pricing_policy_id,p_pricing_policy_version_id,p_pricing_policy_version_number,
    p_pricing_policy_version_revision,p_product_pricing_settings_revision,
    p_payment_rate_source,p_payment_term_revision,p_installation_settings_revision,
    p_costing_aggregation_version,p_effective_cost_at,p_commercial_quantity,p_installments,
    p_total_selling_price,p_request_snapshot,p_public_result_snapshot,p_private_snapshot,
    p_commercial_snapshot,p_actor_id
  ) returning * into v_snapshot;

  insert into public.quote_events(
    quote_id,snapshot_id,event_type,actor_id,payload
  ) values (
    v_quote_id,v_snapshot_id,'QUOTE_CREATED',p_actor_id,
    jsonb_build_object(
      'quote_revision',1,
      'snapshot_version',1,
      'commercial',p_commercial_snapshot
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

create function public.quote_append_snapshot_v2_secure(
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
    total_selling_price,request_snapshot,public_result_snapshot,private_snapshot,
    commercial_snapshot,created_by
  ) values (
    v_snapshot_id,p_quote_id,v_next_version,p_calculation_version,
    p_product_id,p_product_version_id,p_product_version_number,p_product_version_revision,
    p_pricing_policy_id,p_pricing_policy_version_id,p_pricing_policy_version_number,
    p_pricing_policy_version_revision,p_product_pricing_settings_revision,
    p_payment_rate_source,p_payment_term_revision,p_installation_settings_revision,
    p_costing_aggregation_version,p_effective_cost_at,p_commercial_quantity,p_installments,
    p_total_selling_price,p_request_snapshot,p_public_result_snapshot,p_private_snapshot,
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
      'commercial',p_commercial_snapshot
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
      'total_selling_price',s.total_selling_price::text,'request_snapshot',s.request_snapshot,
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

create function public.quote_list_secure(
  p_actor_id uuid,
  p_is_manager boolean,
  p_search text,
  p_status text,
  p_limit integer,
  p_offset integer
) returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
with authorized as (
  select
    q.id,
    q.quote_number,
    q.status,
    q.revision,
    q.customer_name,
    q.customer_phone,
    q.title,
    q.created_at,
    q.updated_at,
    q.created_by,
    s.version_number as snapshot_version,
    s.total_selling_price,
    s.installments,
    s.product_id,
    p.name as product_name,
    pr.email as created_by_email
  from public.quotes q
  join public.quote_snapshots s
    on s.id=q.current_snapshot_id and s.quote_id=q.id
  join public.products p on p.id=s.product_id
  join public.profiles pr on pr.id=q.created_by
  where (p_is_manager or q.created_by=p_actor_id)
    and (p_status is null or q.status=p_status)
    and (
      nullif(btrim(p_search),'') is null
      or q.quote_number::text ilike '%' || btrim(p_search) || '%'
      or q.customer_name ilike '%' || btrim(p_search) || '%'
      or coalesce(q.customer_phone,'') ilike '%' || btrim(p_search) || '%'
      or q.title ilike '%' || btrim(p_search) || '%'
    )
),
counted as (
  select count(*)::integer as total from authorized
),
page as (
  select *
  from authorized
  order by updated_at desc, quote_number desc
  limit least(greatest(coalesce(p_limit,25),1),100)
  offset greatest(coalesce(p_offset,0),0)
)
select jsonb_build_object(
  'items',
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'quote_id',id,
        'quote_number',quote_number,
        'status',status,
        'revision',revision,
        'customer_name',customer_name,
        'customer_phone',customer_phone,
        'title',title,
        'snapshot_version',snapshot_version,
        'total_selling_price',total_selling_price::text,
        'installments',installments,
        'product_id',product_id,
        'product_name',product_name,
        'created_at',created_at,
        'updated_at',updated_at,
        'created_by',created_by,
        'created_by_email',created_by_email
      )
      order by updated_at desc, quote_number desc
    )
    from page
  ), '[]'::jsonb),
  'total',(select total from counted)
);
$$;

revoke all on function public.quote_create_with_snapshot_v2_secure(
  uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,jsonb,jsonb,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.quote_create_with_snapshot_v2_secure(
  uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,jsonb,jsonb,jsonb
) to service_role;

revoke all on function public.quote_append_snapshot_v2_secure(
  uuid,integer,uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,jsonb,jsonb,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.quote_append_snapshot_v2_secure(
  uuid,integer,uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,jsonb,jsonb,jsonb
) to service_role;

revoke all on function public.quote_list_secure(uuid,boolean,text,text,integer,integer)
from public,anon,authenticated,service_role;
grant execute on function public.quote_list_secure(uuid,boolean,text,text,integer,integer)
to service_role;

revoke all on function public.quote_get_current_secure(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.quote_get_current_secure(uuid)
to service_role;
