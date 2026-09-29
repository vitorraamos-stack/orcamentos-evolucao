-- Hotfix 4.0.1c: run with `supabase test db` after applying migrations.
begin;
select plan(31);

insert into auth.users (id,email) values
 ('41000000-0000-4000-8000-000000000001','manager@test.local'),
 ('41000000-0000-4000-8000-000000000002','installer@test.local'),
 ('41000000-0000-4000-8000-000000000003','other@test.local'),
 ('41000000-0000-4000-8000-000000000004','production@test.local'),
 ('41000000-0000-4000-8000-000000000005','art@test.local'),
 ('41000000-0000-4000-8000-000000000006','nohub@test.local');
update public.profiles set role='gerente' where id='41000000-0000-4000-8000-000000000001';
update public.profiles set role='instalador' where id in ('41000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000003','41000000-0000-4000-8000-000000000006');
update public.profiles set role='producao' where id='41000000-0000-4000-8000-000000000004';
update public.profiles set role='arte_finalista' where id='41000000-0000-4000-8000-000000000005';
insert into public.user_module_access(user_id,module_key)
select id,'hub_os' from auth.users where id between '41000000-0000-4000-8000-000000000001' and '41000000-0000-4000-8000-000000000005';
insert into public.os_installation_teams(id,name,active) values
 ('42000000-0000-4000-8000-000000000001','Equipe 01',true),
 ('42000000-0000-4000-8000-000000000002','Equipe inativa',false);
insert into public.os_installation_team_members(team_id,user_id,is_lead) values
 ('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002',true);
insert into public.os_orders(id,sale_number,client_name,art_status,prod_status,logistic_type,address) values
 ('43000000-0000-4000-8000-000000000001','HF401-1','Instalação pronta','Produzir','Pronto / Avisar Cliente','instalacao','Rua Teste, 1'),
 ('43000000-0000-4000-8000-000000000002','HF401-2','Não instalação','Produzir','Pronto / Avisar Cliente','entrega','Rua Teste, 2'),
 ('43000000-0000-4000-8000-000000000003','HF401-3','Não pronta','Produzir','Produção','instalacao','Rua Teste, 3'),
 ('43000000-0000-4000-8000-000000000004','HF401-4','Conflito','Produzir','Pronto / Avisar Cliente','instalacao','Rua Teste, 4'),
 ('43000000-0000-4000-8000-000000000005','HF401-5','Cancelar','Produzir','Pronto / Avisar Cliente','instalacao','Rua Teste, 5');

select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.hub_os_schedule_installation_secure('43000000-0000-4000-8000-000000000001','2026-09-29 12:00+00','2026-09-29 14:00+00','42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002',120,'Strada',null,false)$$,'manager schedules ready installation');
select throws_ok($$select public.hub_os_schedule_installation_secure('43000000-0000-4000-8000-000000000002','2026-09-30 12:00+00')$$,'OS não é do tipo instalação.','non-installation order is rejected');
select throws_ok($$select public.hub_os_schedule_installation_secure('43000000-0000-4000-8000-000000000003','2026-09-30 12:00+00')$$,'OS deve estar em Material Pronto.','order not ready is rejected');
select throws_ok($$select public.hub_os_schedule_installation_secure('43000000-0000-4000-8000-000000000004','2026-09-30 12:00+00',null,'42000000-0000-4000-8000-000000000002')$$,'Equipe inválida ou inativa.','inactive team is rejected');
select throws_ok($$select public.hub_os_schedule_installation_secure('43000000-0000-4000-8000-000000000004','2026-09-29 13:00+00','2026-09-29 15:00+00','42000000-0000-4000-8000-000000000001')$$,'Esta equipe já possui instalação neste horário.','overlapping team schedule is rejected');
select throws_ok($$select public.hub_os_schedule_installation_secure('43000000-0000-4000-8000-000000000004','2026-09-30 12:00+00',null,'42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000004')$$,'Responsável deve ser instalador ou gerente.','invalid responsible role is rejected');
select throws_ok($$select public.hub_os_schedule_installation_secure('43000000-0000-4000-8000-000000000004','2026-09-30 12:00+00',null,'42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000003')$$,'Responsável não pertence à equipe.','responsible outside team is rejected');
select lives_ok($$select public.hub_os_schedule_installation_secure('43000000-0000-4000-8000-000000000004','2026-09-30 12:00+00',null,'42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001')$$,'manager may be responsible outside team');

select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000003',true);
select throws_ok(format('select public.hub_os_start_installation_secure(%L)',(select id from public.os_installations where os_id='43000000-0000-4000-8000-000000000001')),'42501','Instalação não atribuída a este usuário.','unassigned installer cannot start');
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000004',true);
select throws_ok(format('select public.hub_os_start_installation_secure(%L)',(select id from public.os_installations where os_id='43000000-0000-4000-8000-000000000001')),'42501','Perfil não autorizado a executar instalações.','production cannot start');
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000005',true);
select throws_ok(format('select public.hub_os_start_installation_secure(%L)',(select id from public.os_installations where os_id='43000000-0000-4000-8000-000000000001')),'42501','Perfil não autorizado a executar instalações.','art cannot start');
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000006',true);
select throws_ok(format('select public.hub_os_start_installation_secure(%L)',(select id from public.os_installations where os_id='43000000-0000-4000-8000-000000000001')),'42501','Acesso ao Hub OS obrigatório.','user without Hub OS cannot start');
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000002',true);
select lives_ok(format('select public.hub_os_start_installation_secure(%L)',(select id from public.os_installations where os_id='43000000-0000-4000-8000-000000000001')),'assigned installer starts scheduled installation');
select is((select status from public.os_installations where os_id='43000000-0000-4000-8000-000000000001'),'IN_PROGRESS','start changes status');
select ok((select started_at is not null from public.os_installations where os_id='43000000-0000-4000-8000-000000000001'),'start fills started_at');
select ok(exists(select 1 from public.os_orders_event where os_id='43000000-0000-4000-8000-000000000001' and type='INSTALLATION_STARTED'),'start creates event');
select lives_ok(format('select public.hub_os_complete_installation_secure(%L)',(select id from public.os_installations where os_id='43000000-0000-4000-8000-000000000001')),'assigned installer completes in-progress installation');
select is((select status from public.os_installations where os_id='43000000-0000-4000-8000-000000000001'),'COMPLETED','complete changes installation status');
select ok((select completed_at is not null from public.os_installations where os_id='43000000-0000-4000-8000-000000000001'),'complete fills completed_at');
select is((select prod_status from public.os_orders where id='43000000-0000-4000-8000-000000000001'),'Finalizados','complete finalizes order');
select ok(exists(select 1 from public.os_orders_event where os_id='43000000-0000-4000-8000-000000000001' and type='INSTALLATION_COMPLETED'),'complete creates event');
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000002',true);
select throws_ok(format('select public.hub_os_complete_installation_secure(%L)',(select id from public.os_installations where os_id='43000000-0000-4000-8000-000000000004')),'42501','Instalador somente conclui instalação em execução.','installer cannot complete scheduled installation');
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000001',true);
select lives_ok(format('select public.hub_os_complete_installation_secure(%L)',(select id from public.os_installations where os_id='43000000-0000-4000-8000-000000000004')),'manager can complete scheduled installation directly');

select lives_ok($$select public.hub_os_schedule_installation_secure('43000000-0000-4000-8000-000000000005','2026-10-01 12:00+00')$$,'cancel scenario is scheduled');
select throws_ok(format('select public.hub_os_cancel_installation_secure(%L,%L)',(select id from public.os_installations where os_id='43000000-0000-4000-8000-000000000005'),''),'Motivo do cancelamento é obrigatório.','cancel reason is required');
select lives_ok(format('select public.hub_os_cancel_installation_secure(%L,%L)',(select id from public.os_installations where os_id='43000000-0000-4000-8000-000000000005'),'Cliente solicitou reagendamento'),'manager cancels active installation');
select is((select status from public.os_installations where os_id='43000000-0000-4000-8000-000000000005'),'CANCELLED','cancel changes status');
select is((select prod_status from public.os_orders where id='43000000-0000-4000-8000-000000000005'),'Pronto / Avisar Cliente','cancel returns order to ready when no active installation remains');

select ok(not has_function_privilege('public','public.hub_os_start_installation_secure(uuid)','EXECUTE') and not has_function_privilege('anon','public.hub_os_start_installation_secure(uuid)','EXECUTE'),'PUBLIC and anon cannot start');
select ok(has_function_privilege('authenticated','public.hub_os_start_installation_secure(uuid)','EXECUTE') and has_function_privilege('authenticated','public.hub_os_complete_installation_secure(uuid)','EXECUTE'),'authenticated has frontend execution RPCs');
select ok(not has_function_privilege('authenticated','public.hub_os_assert_installation_executor(public.os_installations,boolean)','EXECUTE'),'authenticated cannot execute internal helper');

select * from finish();
rollback;
