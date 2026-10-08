create or replace function public.quote_list_secure(
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
    case
      when s.negotiation_private_snapshot is null then 'OFFICIAL'
      when s.negotiation_private_snapshot->>'mode' = 'OFFICIAL' then 'OFFICIAL'
      when s.negotiation_private_snapshot->>'mode' = 'MANAGER_FINAL_PRICE' then 'MANAGER_ADJUSTED'
      else 'INVALID'
    end as pricing_mode,
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
        'pricing_mode',pricing_mode,
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

revoke all on function public.quote_list_secure(
  uuid,boolean,text,text,integer,integer
) from public,anon,authenticated,service_role;

grant execute on function public.quote_list_secure(
  uuid,boolean,text,text,integer,integer
) to service_role;
