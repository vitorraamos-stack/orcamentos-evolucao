-- Hotfix 4.6b: behavioral hard-delete coverage.
-- Run with `supabase test db` after applying all migrations locally.
begin;
select plan(23);

alter table public.profiles drop constraint if exists profiles_role_check;

insert into auth.users (id, email) values
  ('46b00000-0000-4000-8000-000000000001', 'manager-46b@test.local'),
  ('46b00000-0000-4000-8000-000000000002', 'consultor-46b@test.local');

update public.profiles set role='gerente'
where id='46b00000-0000-4000-8000-000000000001';
update public.profiles set role='consultor_vendas'
where id='46b00000-0000-4000-8000-000000000002';

insert into public.user_module_access(user_id,module_key) values
  ('46b00000-0000-4000-8000-000000000001','hub_os'),
  ('46b00000-0000-4000-8000-000000000002','hub_os');

insert into public.os_orders(id,sale_number,client_name,art_status,prod_status,logistic_type,address) values
  ('46b10000-0000-4000-8000-000000000001','TESTE-46B-DELETE','Excluir com dependências','Produzir','Pronto / Avisar Cliente','instalacao','Rua Teste, 1'),
  ('46b10000-0000-4000-8000-000000000002','TESTE-46B-FIN','Financeiro retido','Produzir','Produção','retirada','Rua Teste, 2'),
  ('46b10000-0000-4000-8000-000000000003','TESTE-46B-PROOF','Comprovante retido','Produzir','Produção','retirada','Rua Teste, 3'),
  ('46b10000-0000-4000-8000-000000000004','TESTE-46B-PENDING','Financeiro pendente permitido','Produzir','Produção','retirada','Rua Teste, 4');

insert into public.os_finance_installments(os_id,installment_no,total_installments,status) values
  ('46b10000-0000-4000-8000-000000000002',1,1,'CONCILIADO'),
  ('46b10000-0000-4000-8000-000000000004',1,1,'AWAITING_PROOF');

insert into public.os_order_assets(
  id,os_id,object_path,original_name,size_bytes,asset_type,storage_provider
) values
  ('46b20000-0000-4000-8000-000000000001','46b10000-0000-4000-8000-000000000003','os_orders/46b10000-0000-4000-8000-000000000003/payment_proofs/proof/Financeiro/Comprovante/teste.pdf','teste.pdf',10,'PAYMENT_PROOF','r2'),
  ('46b20000-0000-4000-8000-000000000002','46b10000-0000-4000-8000-000000000001','os_orders/46b10000-0000-4000-8000-000000000001/Instalacoes/test/after/foto.jpg','foto.jpg',10,'INSTALLATION_EVIDENCE','r2');

insert into public.os_installations(
  id,os_id,status,scheduled_start,address_snapshot
) values (
  '46b30000-0000-4000-8000-000000000001',
  '46b10000-0000-4000-8000-000000000001',
  'SCHEDULED',
  '2026-10-05 12:00+00',
  'Rua Teste, 1'
);

insert into public.os_installation_evidence(
  id,installation_id,asset_id,phase
) values (
  '46b40000-0000-4000-8000-000000000001',
  '46b30000-0000-4000-8000-000000000001',
  '46b20000-0000-4000-8000-000000000002',
  'AFTER'
);

insert into public.os_deliveries(id,os_id,mode,status,scheduled_at) values (
  '46b50000-0000-4000-8000-000000000001',
  '46b10000-0000-4000-8000-000000000001',
  'OWN_DELIVERY',
  'SCHEDULED',
  '2026-10-06 12:00+00'
);

insert into public.os_orders_event(os_id,type,payload) values
  ('46b10000-0000-4000-8000-000000000001','TEST_46B','{}');

select set_config('request.jwt.claim.sub','46b00000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select public.hub_os_delete_order_preview_secure('46b10000-0000-4000-8000-000000000001')$$,
  '42501',
  'Somente gerente/admin pode excluir uma OS.',
  'non-manager cannot preview permanent deletion'
);

select set_config('request.jwt.claim.sub','46b00000-0000-4000-8000-000000000001',true);

select throws_ok(
  $$select public.hub_os_delete_order_secure_v2('46b10000-0000-4000-8000-000000000001','x','TESTE-46B-DELETE','{}')$$,
  '22023',
  'Informe o motivo da exclusão.',
  'short reason is rejected'
);
select ok(exists(select 1 from public.os_orders where id='46b10000-0000-4000-8000-000000000001'),'reason failure preserves order');

select throws_ok(
  $$select public.hub_os_delete_order_secure_v2('46b10000-0000-4000-8000-000000000001','Cadastro criado por engano','CONFIRMACAO-ERRADA','{}')$$,
  '22023',
  'Confirmação da OS inválida.',
  'wrong confirmation is rejected'
);
select ok(exists(select 1 from public.os_installations where id='46b30000-0000-4000-8000-000000000001'),'confirmation failure preserves dependencies');
select is((select count(*)::integer from public.os_order_deletion_audit where original_os_id='46b10000-0000-4000-8000-000000000001'),0,'failed attempts create no deletion audit');

select is(
  (public.hub_os_delete_order_preview_secure('46b10000-0000-4000-8000-000000000002')->>'allowed')::boolean,
  false,
  'settled finance blocks preview'
);
select throws_ok(
  $$select public.hub_os_delete_order_secure_v2('46b10000-0000-4000-8000-000000000002','Cadastro duplicado','TESTE-46B-FIN','{}')$$,
  '23514',
  'Esta OS possui histórico/comprovante financeiro sujeito à retenção e não pode ser excluída definitivamente. Arquive a OS para preservar o histórico.',
  'settled finance blocks hard delete'
);
select ok(exists(select 1 from public.os_orders where id='46b10000-0000-4000-8000-000000000002'),'finance blocker preserves order');

select is(
  (public.hub_os_delete_order_preview_secure('46b10000-0000-4000-8000-000000000003')->>'allowed')::boolean,
  false,
  'payment proof blocks preview'
);
select throws_ok(
  $$select public.hub_os_delete_order_secure_v2('46b10000-0000-4000-8000-000000000003','Cadastro duplicado','TESTE-46B-PROOF','{}')$$,
  '23514',
  'Esta OS possui histórico/comprovante financeiro sujeito à retenção e não pode ser excluída definitivamente. Arquive a OS para preservar o histórico.',
  'payment proof blocks hard delete'
);
select ok(exists(select 1 from public.os_order_assets where os_id='46b10000-0000-4000-8000-000000000003'),'payment proof blocker preserves asset');

select is(
  (public.hub_os_delete_order_preview_secure('46b10000-0000-4000-8000-000000000004')->>'allowed')::boolean,
  true,
  'AWAITING_PROOF without proof does not block deletion'
);

select lives_ok(
  $$select public.hub_os_delete_order_secure_v2('46b10000-0000-4000-8000-000000000001','OS criada exclusivamente para teste','TESTE-46B-DELETE','{}')$$,
  'manager hard-deletes eligible OS'
);
select ok(not exists(select 1 from public.os_orders where id='46b10000-0000-4000-8000-000000000001'),'order is deleted');
select ok(not exists(select 1 from public.os_installations where os_id='46b10000-0000-4000-8000-000000000001'),'installation is deleted');
select ok(not exists(select 1 from public.os_deliveries where os_id='46b10000-0000-4000-8000-000000000001'),'delivery is deleted');
select ok(not exists(select 1 from public.os_installation_evidence where installation_id='46b30000-0000-4000-8000-000000000001'),'installation evidence is deleted');
select ok(not exists(select 1 from public.os_installation_checklist_items where installation_id='46b30000-0000-4000-8000-000000000001'),'installation checklist is deleted');
select ok(not exists(select 1 from public.os_order_assets where os_id='46b10000-0000-4000-8000-000000000001'),'assets are deleted');
select ok(not exists(select 1 from public.os_orders_event where os_id='46b10000-0000-4000-8000-000000000001'),'operational events are deleted');
select ok(exists(select 1 from public.os_order_deletion_audit where original_os_id='46b10000-0000-4000-8000-000000000001' and reason='OS criada exclusivamente para teste'),'independent audit survives deletion');
select ok((select r2_cleanup_status='PENDING' and cardinality(r2_keys)=1 from public.os_order_deletion_audit where original_os_id='46b10000-0000-4000-8000-000000000001'),'audit retains pending R2 key');

select * from finish();
rollback;
