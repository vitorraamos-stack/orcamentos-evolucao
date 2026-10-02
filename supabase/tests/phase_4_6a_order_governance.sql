-- Phase 4.6a governance contracts. Run with `supabase test db` after applying migrations locally.
begin;
select plan(14);
select has_table('public','os_order_deletion_audit','independent deletion audit exists');
select has_function('public','hub_os_delete_order_preview_secure',array['uuid'],'preview RPC exists');
select has_function('public','hub_os_delete_order_secure_v2',array['uuid','text','text','jsonb'],'v2 RPC exists');
select has_function('public','hub_os_mark_order_delete_cleanup_secure',array['uuid','integer','jsonb'],'cleanup marker exists');
select is((select prosecdef from pg_proc where oid='public.hub_os_delete_order_preview_secure(uuid)'::regprocedure),true,'preview is security definer');
select is((select prosecdef from pg_proc where oid='public.hub_os_delete_order_secure_v2(uuid,text,text,jsonb)'::regprocedure),true,'delete is security definer');
select ok(not has_function_privilege('anon','public.hub_os_delete_order_preview_secure(uuid)','EXECUTE'),'anon cannot preview');
select ok(not has_function_privilege('anon','public.hub_os_delete_order_secure_v2(uuid,text,text,jsonb)','EXECUTE'),'anon cannot delete');
select ok(not has_function_privilege('public','public.hub_os_delete_order_secure_v2(uuid,text,text,jsonb)','EXECUTE'),'PUBLIC cannot delete');
select ok(has_function_privilege('authenticated','public.hub_os_delete_order_preview_secure(uuid)','EXECUTE'),'authenticated receives preview grant');
select ok(has_function_privilege('authenticated','public.hub_os_delete_order_secure_v2(uuid,text,text,jsonb)','EXECUTE'),'authenticated receives delete grant');
select ok(not exists(select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_class f on f.oid=c.confrelid where t.relname='os_order_deletion_audit' and f.relname='os_orders'),'audit has no order FK');
select col_is_pk('public','os_order_deletion_audit','id','audit id is primary key');
select ok((select relrowsecurity from pg_class where oid='public.os_order_deletion_audit'::regclass),'audit RLS is enabled');
select * from finish();
rollback;
