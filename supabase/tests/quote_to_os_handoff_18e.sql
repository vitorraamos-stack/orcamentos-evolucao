-- 18E Quote → OS handoff structural/security checks.
begin;
select plan(17);

select has_column('public','os_orders','quote_id','os_orders quote_id exists');
select has_column('public','os_orders','quote_snapshot_id','os_orders quote_snapshot_id exists');
select has_column('public','os_orders','quote_total','os_orders quote_total exists');
select has_column('public','os_orders','customer_phone','os_orders customer_phone exists');

select has_index('public','os_orders','os_orders_quote_id_unique','one OS per Quote index exists');

select has_function(
  'public',
  'hub_os_create_from_quote_secure',
  array['uuid','jsonb'],
  'Quote conversion RPC exists'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.hub_os_create_from_quote_secure(uuid,jsonb)',
    'EXECUTE'
  ),
  'authenticated can execute Quote conversion'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.hub_os_create_from_quote_secure(uuid,jsonb)',
    'EXECUTE'
  ),
  'anon cannot execute Quote conversion'
);
select ok(
  not has_function_privilege(
    'public',
    'public.hub_os_create_from_quote_secure(uuid,jsonb)',
    'EXECUTE'
  ),
  'PUBLIC cannot execute Quote conversion'
);

select ok(
  (select prosecdef
   from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname='hub_os_create_from_quote_secure'),
  'conversion RPC is SECURITY DEFINER'
);

select ok(
  position(
    'search_path=pg_catalog, public'
    in coalesce((
      select array_to_string(proconfig, ',')
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
        and p.proname='hub_os_create_from_quote_secure'
    ), '')
  ) > 0,
  'conversion RPC fixes search_path'
);

select ok(
  exists(
    select 1 from pg_constraint
    where conrelid='public.os_orders'::regclass
      and conname='os_orders_quote_id_fkey'
  ),
  'Quote foreign key exists'
);
select ok(
  exists(
    select 1 from pg_constraint
    where conrelid='public.os_orders'::regclass
      and conname='os_orders_quote_snapshot_fkey'
  ),
  'Quote snapshot foreign key exists'
);
select ok(
  exists(
    select 1 from pg_constraint
    where conrelid='public.os_orders'::regclass
      and conname='os_orders_quote_link_complete'
  ),
  'Quote provenance completeness constraint exists'
);
select ok(
  exists(
    select 1 from pg_constraint
    where conrelid='public.os_orders'::regclass
      and conname='os_orders_quote_total_nonnegative'
  ),
  'Quote total constraint exists'
);

select ok(
  (select relrowsecurity from pg_class where oid='public.os_orders'::regclass),
  'os_orders RLS remains enabled'
);

select is(
  (select count(*)::integer
   from pg_indexes
   where schemaname='public'
     and tablename='os_orders'
     and indexname='os_orders_quote_id_unique'),
  1,
  'exactly one Quote idempotency index exists'
);

select * from finish();
rollback;
