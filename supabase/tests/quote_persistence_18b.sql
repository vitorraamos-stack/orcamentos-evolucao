-- Quote persistence 18B structural/security tests.
-- Run against a fresh/local database after migrations: supabase test db
begin;
select plan(30);

select has_table('public','quotes','quotes table exists');
select has_table('public','quote_snapshots','quote snapshots table exists');
select has_table('public','quote_events','quote events table exists');

select ok((select relrowsecurity from pg_class where oid='public.quotes'::regclass),'quotes RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.quote_snapshots'::regclass),'quote_snapshots RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.quote_events'::regclass),'quote_events RLS enabled');

select ok(not has_table_privilege('anon','public.quotes','SELECT'),'anon cannot read quotes');
select ok(not has_table_privilege('authenticated','public.quotes','SELECT'),'authenticated cannot read quotes directly');
select ok(not has_table_privilege('anon','public.quote_snapshots','SELECT'),'anon cannot read quote snapshots');
select ok(not has_table_privilege('authenticated','public.quote_snapshots','SELECT'),'authenticated cannot read quote snapshots directly');
select ok(not has_table_privilege('anon','public.quote_events','SELECT'),'anon cannot read quote events');
select ok(not has_table_privilege('authenticated','public.quote_events','SELECT'),'authenticated cannot read quote events directly');

select ok(has_table_privilege('service_role','public.quotes','SELECT'),'service_role can read quotes');
select ok(has_table_privilege('service_role','public.quotes','INSERT'),'service_role can create quotes');
select ok(has_table_privilege('service_role','public.quotes','UPDATE'),'service_role can update quote lifecycle/current snapshot');
select ok(not has_table_privilege('service_role','public.quotes','DELETE'),'service_role cannot delete quotes');
select ok(not has_table_privilege('service_role','public.quotes','TRUNCATE'),'service_role cannot truncate quotes');

select ok(has_table_privilege('service_role','public.quote_snapshots','SELECT'),'service_role can read snapshots');
select ok(has_table_privilege('service_role','public.quote_snapshots','INSERT'),'service_role can append snapshots');
select ok(not has_table_privilege('service_role','public.quote_snapshots','UPDATE'),'service_role cannot update snapshots');
select ok(not has_table_privilege('service_role','public.quote_snapshots','DELETE'),'service_role cannot delete snapshots');
select ok(not has_table_privilege('service_role','public.quote_snapshots','TRUNCATE'),'service_role cannot truncate snapshots');

select ok(has_table_privilege('service_role','public.quote_events','SELECT'),'service_role can read quote events');
select ok(has_table_privilege('service_role','public.quote_events','INSERT'),'service_role can append quote events');
select ok(not has_table_privilege('service_role','public.quote_events','UPDATE'),'service_role cannot update quote events');
select ok(not has_table_privilege('service_role','public.quote_events','DELETE'),'service_role cannot delete quote events');

select has_function(
  'public',
  'quote_transition_status_secure',
  array['uuid','integer','text','uuid'],
  'quote status transition RPC exists'
);
select has_function(
  'public',
  'quote_get_current_secure',
  array['uuid'],
  'quote current snapshot RPC exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.quote_get_current_secure(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.quote_get_current_secure(uuid)',
    'EXECUTE'
  ),
  'client roles cannot execute quote read RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.quote_get_current_secure(uuid)',
    'EXECUTE'
  ),
  'service_role can execute quote read RPC'
);

select * from finish();
rollback;
