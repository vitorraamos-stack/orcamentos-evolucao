-- Phase 4.1 structural/security contract. Behavioral paths are also protected by RPC guards.
begin;
select plan(14);
select has_table('public','os_installation_checklist_items','checklist table exists');
select has_table('public','os_installation_evidence','evidence table exists');
select has_column('public','os_installations','completion_notes','completion notes exists');
select col_is_unique('public','os_installation_evidence','asset_id','evidence asset is unique');
select has_function('public','hub_os_seed_installation_checklist',array['uuid'],'seed helper exists');
select has_function('public','hub_os_set_installation_checklist_item_secure',array['uuid','text','text'],'checklist mutation exists');
select has_function('public','hub_os_get_installation_evidence_scope_secure',array['uuid','text'],'evidence scope exists');
select has_function('public','hub_os_register_installation_evidence_secure',array['uuid','text','text','text','text','bigint','text','text','text'],'register evidence exists');
select has_function('public','hub_os_update_installation_completion_notes_secure',array['uuid','text'],'notes mutation exists');
select has_function('public','hub_os_force_complete_installation_secure',array['uuid','text'],'override exists');
select ok(not has_function_privilege('public','public.hub_os_force_complete_installation_secure(uuid,text)','EXECUTE') and not has_function_privilege('anon','public.hub_os_force_complete_installation_secure(uuid,text)','EXECUTE'),'PUBLIC and anon cannot force complete');
select ok(has_function_privilege('authenticated','public.hub_os_register_installation_evidence_secure(uuid,text,text,text,text,bigint,text,text,text)','EXECUTE'),'authenticated may call frontend registration RPC');
select ok(not has_function_privilege('authenticated','public.hub_os_seed_installation_checklist(uuid)','EXECUTE'),'seed helper is internal');
select ok((select relrowsecurity from pg_class where oid='public.os_installation_checklist_items'::regclass) and (select relrowsecurity from pg_class where oid='public.os_installation_evidence'::regclass),'RLS is active');
select * from finish();
rollback;
