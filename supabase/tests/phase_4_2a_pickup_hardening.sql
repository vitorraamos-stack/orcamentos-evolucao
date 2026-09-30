-- Phase 4.2a pickup hardening. Run with `supabase test db` after applying migrations.
begin;
select plan(21);

select has_function('public', 'order_flow_mark_retirado_and_finalize_secure', array['text','text','uuid','text'], 'pickup completion RPC exists');
select is((select prosecdef from pg_proc where oid = 'public.order_flow_mark_retirado_and_finalize_secure(text,text,uuid,text)'::regprocedure), true, 'pickup completion RPC is SECURITY DEFINER');
select ok(has_function_privilege('authenticated', 'public.order_flow_mark_retirado_and_finalize_secure(text,text,uuid,text)', 'EXECUTE'), 'authenticated can execute pickup RPC');
select ok(not has_function_privilege('anon', 'public.order_flow_mark_retirado_and_finalize_secure(text,text,uuid,text)', 'EXECUTE'), 'anon cannot execute pickup RPC');
select ok(not has_function_privilege('public', 'public.order_flow_mark_retirado_and_finalize_secure(text,text,uuid,text)', 'EXECUTE'), 'PUBLIC cannot execute pickup RPC');

insert into auth.users (id, email) values
  ('42a00000-0000-4000-8000-000000000001', 'pickup-manager@test.local'),
  ('42a00000-0000-4000-8000-000000000002', 'pickup-production@test.local'),
  ('42a00000-0000-4000-8000-000000000003', 'pickup-consultant@test.local');
update public.profiles set role = 'gerente' where id = '42a00000-0000-4000-8000-000000000001';
update public.profiles set role = 'producao' where id = '42a00000-0000-4000-8000-000000000002';
update public.profiles set role = 'consultor_vendas' where id = '42a00000-0000-4000-8000-000000000003';
insert into public.user_module_access (user_id, module_key) values
  ('42a00000-0000-4000-8000-000000000001', 'hub_os'),
  ('42a00000-0000-4000-8000-000000000002', 'hub_os'),
  ('42a00000-0000-4000-8000-000000000003', 'hub_os');

insert into public.os_orders (id, sale_number, client_name, art_status, prod_status, logistic_type, archived) values
  ('42a10000-0000-4000-8000-000000000001', 'PH42A-1', 'Retirada gerente', 'Produzir', 'Pronto / Avisar Cliente', 'retirada', false),
  ('42a10000-0000-4000-8000-000000000002', 'PH42A-2', 'Retirada produção', 'Produzir', 'Pronto / Avisar Cliente', 'retirada', false),
  ('42a10000-0000-4000-8000-000000000003', 'PH42A-3', 'Entrega', 'Produzir', 'Pronto / Avisar Cliente', 'entrega', false),
  ('42a10000-0000-4000-8000-000000000004', 'PH42A-4', 'Instalação', 'Produzir', 'Pronto / Avisar Cliente', 'instalacao', false),
  ('42a10000-0000-4000-8000-000000000005', 'PH42A-5', 'Arquivada', 'Produzir', 'Pronto / Avisar Cliente', 'retirada', true),
  ('42a10000-0000-4000-8000-000000000006', 'PH42A-6', 'Produção', 'Produzir', 'Produção', 'retirada', false),
  ('42a10000-0000-4000-8000-000000000007', 'PH42A-7', 'Não autorizada', 'Produzir', 'Pronto / Avisar Cliente', 'retirada', false);

insert into public.hub_os_order_flow_state (order_key, source_type, source_id, avisado_at, avisado_by)
values ('os_orders:42a10000-0000-4000-8000-000000000001', 'os_orders', '42a10000-0000-4000-8000-000000000001', now(), '42a00000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub', '42a00000-0000-4000-8000-000000000003', true);
select throws_ok($$select public.order_flow_mark_retirado_and_finalize_secure('os_orders:42a10000-0000-4000-8000-000000000007','os_orders','42a10000-0000-4000-8000-000000000007')$$, '42501', 'Sem permissão para gerenciar entregas.', 'consultant with Hub OS cannot complete pickup');

select set_config('request.jwt.claim.sub', '42a00000-0000-4000-8000-000000000001', true);
select throws_ok($$select public.order_flow_mark_retirado_and_finalize_secure('os_orders:42a10000-0000-4000-8000-000000000003','os_orders','42a10000-0000-4000-8000-000000000003')$$, 'P0001', 'Esta OS não está configurada para retirada.', 'delivery order is rejected');
select throws_ok($$select public.order_flow_mark_retirado_and_finalize_secure('os_orders:42a10000-0000-4000-8000-000000000004','os_orders','42a10000-0000-4000-8000-000000000004')$$, 'P0001', 'Esta OS não está configurada para retirada.', 'installation order is rejected');
select throws_ok($$select public.order_flow_mark_retirado_and_finalize_secure('os_orders:42a10000-0000-4000-8000-000000000005','os_orders','42a10000-0000-4000-8000-000000000005')$$, 'P0001', 'OS arquivada não pode ser retirada.', 'archived order is rejected');
select throws_ok($$select public.order_flow_mark_retirado_and_finalize_secure('os_orders:42a10000-0000-4000-8000-000000000006','os_orders','42a10000-0000-4000-8000-000000000006')$$, 'P0001', 'OS ainda não está disponível para retirada.', 'order still in production is rejected');
select throws_ok($$select public.order_flow_mark_retirado_and_finalize_secure('os_orders:42a10000-0000-4000-8000-000000000002','os_orders','42a10000-0000-4000-8000-000000000001')$$, 'P0001', 'Chave da OS incompatível com a retirada.', 'mismatched order key is rejected');
select throws_ok($$select public.order_flow_mark_retirado_and_finalize_secure('os:42a10000-0000-4000-8000-000000000001','os','42a10000-0000-4000-8000-000000000001')$$, 'P0001', 'Fonte inválida para retirada.', 'non-canonical source is rejected');

select lives_ok($$select public.order_flow_mark_retirado_and_finalize_secure('os_orders:42a10000-0000-4000-8000-000000000001','os_orders','42a10000-0000-4000-8000-000000000001','Gerente')$$, 'manager completes ready pickup');
select is((select prod_status from public.os_orders where id = '42a10000-0000-4000-8000-000000000001'), 'Finalizados', 'pickup finalizes order');
select ok((select retirado_at is not null and retirado_by = '42a00000-0000-4000-8000-000000000001' and avisado_at is null and avisado_by is null from public.hub_os_order_flow_state where order_key = 'os_orders:42a10000-0000-4000-8000-000000000001'), 'flow records actor and timestamp and clears notification');

create temporary table pickup_first_result as
select retirado_at, retirado_by,
  (select count(*) from public.os_orders_event where os_id = '42a10000-0000-4000-8000-000000000001') as event_count
from public.hub_os_order_flow_state where order_key = 'os_orders:42a10000-0000-4000-8000-000000000001';
select ok((select already_retirado from public.order_flow_mark_retirado_and_finalize_secure('os_orders:42a10000-0000-4000-8000-000000000001','os_orders','42a10000-0000-4000-8000-000000000001','Gerente')), 'second call reports idempotency');
select ok((select f.retirado_at = r.retirado_at and f.retirado_by = r.retirado_by from pickup_first_result f cross join public.hub_os_order_flow_state r where r.order_key = 'os_orders:42a10000-0000-4000-8000-000000000001'), 'second call preserves original pickup timestamp and actor');
select is((select count(*) from public.os_orders_event where os_id = '42a10000-0000-4000-8000-000000000001'), (select event_count from pickup_first_result), 'second call does not duplicate events');

select set_config('request.jwt.claim.sub', '42a00000-0000-4000-8000-000000000002', true);
select lives_ok($$select public.order_flow_mark_retirado_and_finalize_secure('os_orders:42a10000-0000-4000-8000-000000000002','os_orders','42a10000-0000-4000-8000-000000000002','Produção')$$, 'production completes ready pickup');
select ok((select prod_status = 'Finalizados' from public.os_orders where id = '42a10000-0000-4000-8000-000000000002'), 'production pickup is finalized');
select ok((select retirado_by = '42a00000-0000-4000-8000-000000000002' from public.hub_os_order_flow_state where order_key = 'os_orders:42a10000-0000-4000-8000-000000000002'), 'production actor is recorded');

select * from finish();
rollback;
