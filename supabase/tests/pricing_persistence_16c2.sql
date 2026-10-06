-- Pricing Persistence 16C.2 structural security tests.
-- Run only against a fresh/local database after migrations: supabase test db
begin;
select plan(28);

select has_table('public','pricing_policies','pricing policies table exists');
select has_table('public','pricing_policy_versions','pricing policy versions table exists');
select has_table('public','product_pricing_settings','product pricing settings table exists');
select has_table('public','pricing_payment_terms','pricing payment terms table exists');
select has_table('public','pricing_audit_events','pricing audit table exists');

select ok((select relrowsecurity from pg_class where oid='public.pricing_policies'::regclass),'pricing_policies RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.pricing_policy_versions'::regclass),'pricing_policy_versions RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.product_pricing_settings'::regclass),'product_pricing_settings RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.pricing_payment_terms'::regclass),'pricing_payment_terms RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.pricing_audit_events'::regclass),'pricing_audit_events RLS enabled');

select ok(not has_table_privilege('anon','public.pricing_policies','SELECT'),'anon cannot read pricing policies');
select ok(not has_table_privilege('authenticated','public.pricing_policies','SELECT'),'authenticated cannot read pricing policies directly');
select ok(not has_table_privilege('anon','public.product_pricing_settings','SELECT'),'anon cannot read product pricing settings');
select ok(not has_table_privilege('authenticated','public.pricing_payment_terms','SELECT'),'authenticated cannot read payment terms directly');

select ok(has_table_privilege('service_role','public.pricing_policies','SELECT'),'service_role can read policies');
select ok(has_table_privilege('service_role','public.pricing_policies','INSERT'),'service_role can insert policies');
select ok(has_table_privilege('service_role','public.pricing_policies','UPDATE'),'service_role can update policies');
select ok(not has_table_privilege('service_role','public.pricing_policies','DELETE'),'service_role cannot delete policies');
select ok(not has_table_privilege('service_role','public.pricing_policies','TRUNCATE'),'service_role cannot truncate policies');
select ok(not has_table_privilege('service_role','public.pricing_policies','REFERENCES'),'service_role has no REFERENCES privilege');
select ok(not has_table_privilege('service_role','public.pricing_policies','TRIGGER'),'service_role has no TRIGGER privilege');

select has_function('public','pricing_create_policy_secure',array['text','text','text','text','numeric','text','uuid','text','text','text','text'],'create policy RPC exists');
select has_function('public','pricing_publish_version_secure',array['uuid','integer','uuid','uuid'],'publish RPC exists');
select has_function('public','pricing_set_product_settings_secure',array['uuid','uuid','numeric','integer','uuid'],'product settings RPC exists');
select has_function('public','pricing_set_payment_term_secure',array['integer','numeric','integer','uuid'],'payment term RPC exists');

select ok(not has_function_privilege('anon','public.pricing_create_policy_secure(text,text,text,text,numeric,text,uuid,text,text,text,text)','EXECUTE'),'anon cannot execute Pricing admin RPC');
select ok(not has_function_privilege('authenticated','public.pricing_create_policy_secure(text,text,text,text,numeric,text,uuid,text,text,text,text)','EXECUTE'),'authenticated cannot execute Pricing admin RPC');
select ok(has_function_privilege('service_role','public.pricing_create_policy_secure(text,text,text,text,numeric,text,uuid,text,text,text,text)','EXECUTE'),'service_role can execute Pricing admin RPC');

select * from finish();
rollback;
