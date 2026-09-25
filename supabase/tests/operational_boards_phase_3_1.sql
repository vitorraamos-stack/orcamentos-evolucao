-- Run with `supabase test db` after applying migrations.
begin;
select plan(8);

select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'os_orders'), 'orders are published');
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'os_order_assignees'), 'assignees are published');
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'os_order_items'), 'items are published');
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'os_order_deadlines'), 'deadlines are published');
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'os_order_comments'), 'comments are published');

select has_function('public', 'hub_os_send_to_production_secure', array['uuid','timestamp with time zone','date','text','jsonb']);
select function_privs_are('public', 'hub_os_send_to_production_secure', array['uuid','timestamp with time zone','date','text','jsonb'], 'authenticated', array['EXECUTE']);
select ok(not has_function_privilege('anon', 'public.hub_os_send_to_production_secure(uuid,timestamptz,date,text,jsonb)', 'EXECUTE'), 'anon cannot execute handoff');

select * from finish();
rollback;
