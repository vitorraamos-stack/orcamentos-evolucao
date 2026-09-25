-- Run with `supabase test db` after applying migrations.
begin;
select plan(16);

select ok(public.hub_os_can_transition_art('Em Criação', 'Para Aprovação'), 'Arte accepts Em Criação -> Para Aprovação');
select ok(public.hub_os_can_transition_art('Para Aprovação', 'Produzir'), 'Arte accepts handoff to Produção');
select ok(public.hub_os_can_transition_art('Ajustes', 'Em Criação'), 'Arte accepts the adjustment loop');
select ok(not public.hub_os_can_transition_art('Caixa de Entrada', 'Produzir'), 'Arte rejects Caixa de Entrada -> Produzir');
select ok(not public.hub_os_can_transition_art('Em Criação', 'Finalizados'), 'Arte rejects cross-board destination');

select ok(public.hub_os_can_transition_production('Produção', 'Em Acabamento'), 'Produção accepts its first edge');
select ok(public.hub_os_can_transition_production('Em Acabamento', 'Pronto / Avisar Cliente'), 'Produção accepts finishing -> ready');
select ok(public.hub_os_can_transition_production('Instalação Agendada', 'Finalizados'), 'Produção accepts installation -> finished');
select ok(not public.hub_os_can_transition_production('Produção', 'Finalizados'), 'Produção rejects a completion jump');
select ok(not public.hub_os_can_transition_production('Em Criação', 'Para Aprovação'), 'Produção rejects Art vocabulary');

select ok(not has_function_privilege('anon', 'public.hub_os_move_order_secure(uuid,text,text,jsonb)', 'EXECUTE'), 'anon cannot move OS');
select ok(not has_function_privilege('anon', 'public.hub_os_update_order_secure(uuid,jsonb,text,jsonb)', 'EXECUTE'), 'anon cannot update OS');
select ok(not exists (
  select 1 from aclexplode((select proacl from pg_proc where oid = 'public.hub_os_move_order_secure(uuid,text,text,jsonb)'::regprocedure))
  where grantee = 0 and privilege_type = 'EXECUTE'
), 'PUBLIC cannot move OS');
select ok(not exists (
  select 1 from aclexplode((select proacl from pg_proc where oid = 'public.hub_os_update_order_secure(uuid,jsonb,text,jsonb)'::regprocedure))
  where grantee = 0 and privilege_type = 'EXECUTE'
), 'PUBLIC cannot update OS');
select ok(has_function_privilege('authenticated', 'public.hub_os_move_order_secure(uuid,text,text,jsonb)', 'EXECUTE'), 'authenticated can call move contract');
select ok(has_function_privilege('authenticated', 'public.hub_os_update_order_secure(uuid,jsonb,text,jsonb)', 'EXECUTE'), 'authenticated can call managerial update contract');

select * from finish();
rollback;
