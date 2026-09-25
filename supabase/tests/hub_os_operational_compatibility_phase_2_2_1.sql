-- Run with `supabase test db` after applying migrations.
-- Authorization/state behavior is enforced in the function bodies; this suite
-- protects their exposed contract and SECURITY DEFINER grant boundary.
begin;
select plan(16);

select has_function('public', 'hub_os_send_to_production_secure', array['uuid','timestamp with time zone','date','text','jsonb']);
select has_function('public', 'hub_os_return_order_to_art_secure', array['uuid','text','jsonb']);
select has_function('public', 'hub_os_set_production_tag_secure', array['uuid','text','text']);
select has_function('public', 'hub_os_update_insumos_secure', array['uuid','text','text']);

select function_privs_are('public', 'hub_os_send_to_production_secure', array['uuid','timestamp with time zone','date','text','jsonb'], 'authenticated', array['EXECUTE']);
select function_privs_are('public', 'hub_os_return_order_to_art_secure', array['uuid','text','jsonb'], 'authenticated', array['EXECUTE']);
select function_privs_are('public', 'hub_os_set_production_tag_secure', array['uuid','text','text'], 'authenticated', array['EXECUTE']);
select function_privs_are('public', 'hub_os_update_insumos_secure', array['uuid','text','text'], 'authenticated', array['EXECUTE']);

select ok(not has_function_privilege('anon', 'public.hub_os_send_to_production_secure(uuid,timestamptz,date,text,jsonb)', 'EXECUTE'), 'anon cannot hand off to production');
select ok(not has_function_privilege('anon', 'public.hub_os_return_order_to_art_secure(uuid,text,jsonb)', 'EXECUTE'), 'anon cannot return to Art');
select ok(not has_function_privilege('anon', 'public.hub_os_set_production_tag_secure(uuid,text,text)', 'EXECUTE'), 'anon cannot set production tags');
select ok(not has_function_privilege('anon', 'public.hub_os_update_insumos_secure(uuid,text,text)', 'EXECUTE'), 'anon cannot update supplies');

select function_lang_is('public', 'hub_os_send_to_production_secure', array['uuid','timestamp with time zone','date','text','jsonb'], 'plpgsql');
select function_lang_is('public', 'hub_os_return_order_to_art_secure', array['uuid','text','jsonb'], 'plpgsql');
select function_lang_is('public', 'hub_os_set_production_tag_secure', array['uuid','text','text'], 'plpgsql');
select function_lang_is('public', 'hub_os_update_insumos_secure', array['uuid','text','text'], 'plpgsql');

select * from finish();
rollback;
