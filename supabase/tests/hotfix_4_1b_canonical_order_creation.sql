-- Hotfix 4.1b: run with `supabase test db` after applying migrations.
begin;
select plan(16);

alter table public.profiles drop constraint if exists profiles_role_check;

insert into auth.users (id, email) values
  ('41b00000-0000-4000-8000-000000000001', 'manager-41b@test.local'),
  ('41b00000-0000-4000-8000-000000000002', 'sales-41b@test.local'),
  ('41b00000-0000-4000-8000-000000000003', 'admin-41b@test.local'),
  ('41b00000-0000-4000-8000-000000000004', 'consultor-41b@test.local'),
  ('41b00000-0000-4000-8000-000000000005', 'art-41b@test.local'),
  ('41b00000-0000-4000-8000-000000000006', 'production-41b@test.local'),
  ('41b00000-0000-4000-8000-000000000007', 'installer-41b@test.local'),
  ('41b00000-0000-4000-8000-000000000008', 'no-hub-41b@test.local');

update public.profiles set role = case id
  when '41b00000-0000-4000-8000-000000000001' then 'gerente'
  when '41b00000-0000-4000-8000-000000000002' then 'consultor_vendas'
  when '41b00000-0000-4000-8000-000000000003' then 'admin'
  when '41b00000-0000-4000-8000-000000000004' then 'consultor'
  when '41b00000-0000-4000-8000-000000000005' then 'arte_finalista'
  when '41b00000-0000-4000-8000-000000000006' then 'producao'
  when '41b00000-0000-4000-8000-000000000007' then 'instalador'
  else 'gerente'
end
where id::text like '41b00000-%';

insert into public.user_module_access (user_id, module_key)
select id, 'hub_os' from auth.users
where id between '41b00000-0000-4000-8000-000000000001'
  and '41b00000-0000-4000-8000-000000000007';

create temporary table legacy_count_41b as select count(*)::bigint as value from public.os;

select set_config('request.jwt.claim.sub', '41b00000-0000-4000-8000-000000000001', true);
select lives_ok($$select public.hub_os_create_order_secure('{"sale_number":"TEST-41B","client_name":"Teste OS","art_status":"Produzir","prod_status":"Produção","archived":true}'::jsonb)$$, 'gerente can create');
select set_config('request.jwt.claim.sub', '41b00000-0000-4000-8000-000000000002', true);
select lives_ok($$select public.hub_os_create_order_secure('{"sale_number":"TEST-41B-SALES","client_name":"Teste vendas"}'::jsonb)$$, 'consultor_vendas can create');
select set_config('request.jwt.claim.sub', '41b00000-0000-4000-8000-000000000003', true);
select lives_ok($$select public.hub_os_create_order_secure('{"sale_number":"TEST-41B-ADMIN","client_name":"Teste admin"}'::jsonb)$$, 'legacy admin can create');
select set_config('request.jwt.claim.sub', '41b00000-0000-4000-8000-000000000004', true);
select lives_ok($$select public.hub_os_create_order_secure('{"sale_number":"TEST-41B-CONSULTOR","client_name":"Teste consultor"}'::jsonb)$$, 'legacy consultor can create');

select set_config('request.jwt.claim.sub', '41b00000-0000-4000-8000-000000000005', true);
select throws_ok($$select public.hub_os_create_order_secure('{"sale_number":"DENIED-ART","client_name":"Negado"}'::jsonb)$$, '42501', 'Somente gerente ou consultor de vendas pode criar OS.', 'arte_finalista is rejected');
select set_config('request.jwt.claim.sub', '41b00000-0000-4000-8000-000000000006', true);
select throws_ok($$select public.hub_os_create_order_secure('{"sale_number":"DENIED-PROD","client_name":"Negado"}'::jsonb)$$, '42501', 'Somente gerente ou consultor de vendas pode criar OS.', 'producao is rejected');
select set_config('request.jwt.claim.sub', '41b00000-0000-4000-8000-000000000007', true);
select throws_ok($$select public.hub_os_create_order_secure('{"sale_number":"DENIED-INSTALLER","client_name":"Negado"}'::jsonb)$$, '42501', 'Somente gerente ou consultor de vendas pode criar OS.', 'instalador is rejected');
select set_config('request.jwt.claim.sub', '41b00000-0000-4000-8000-000000000008', true);
select throws_ok($$select public.hub_os_create_order_secure('{"sale_number":"DENIED-NOHUB","client_name":"Negado"}'::jsonb)$$, '42501', 'Usuário sem acesso ao módulo hub_os.', 'user without hub_os is rejected');
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select public.hub_os_create_order_secure('{"sale_number":"DENIED-ANON","client_name":"Negado"}'::jsonb)$$, '42501', 'Usuário não autenticado.', 'anonymous actor is rejected');

select ok(not has_table_privilege('authenticated', 'public.os_orders', 'INSERT'), 'authenticated has no direct INSERT privilege');
set local role authenticated;
select throws_ok($$insert into public.os_orders (sale_number, client_name) values ('DIRECT-41B', 'Direto')$$, '42501', null, 'authenticated direct INSERT is rejected');
reset role;

select ok(exists(select 1 from public.os_orders where sale_number = 'TEST-41B' and client_name = 'Teste OS'), 'RPC creates the canonical os_orders row');
select ok((select art_status = 'Caixa de Entrada' and prod_status is null and not archived from public.os_orders where sale_number = 'TEST-41B'), 'server enforces initial workflow state');
select ok((select created_by = '41b00000-0000-4000-8000-000000000001' and updated_by = '41b00000-0000-4000-8000-000000000001' from public.os_orders where sale_number = 'TEST-41B'), 'server derives audit actors from auth.uid');
select ok(exists(select 1 from public.os_orders_event e join public.os_orders o on o.id=e.os_id where o.sale_number='TEST-41B' and e.type='create' and e.created_by=o.created_by), 'creation event is recorded');
select is((select count(*)::bigint from public.os), (select value from legacy_count_41b), 'legacy public.os receives no row');

select * from finish();
rollback;
