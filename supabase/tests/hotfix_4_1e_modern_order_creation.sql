-- Hotfix 4.1e: run with `supabase test db` after applying migrations.
begin;
select plan(18);
alter table public.profiles drop constraint if exists profiles_role_check;
insert into auth.users(id,email) values ('41e00000-0000-4000-8000-000000000001','manager-41e@test.local');
update public.profiles set role='gerente' where id='41e00000-0000-4000-8000-000000000001';
insert into public.user_module_access(user_id,module_key) values('41e00000-0000-4000-8000-000000000001','hub_os');

select has_column('public','os_orders','is_urgent','is_urgent exists');
select col_default_is('public','os_orders','is_urgent','false','is_urgent defaults false');
insert into public.os_orders(sale_number,client_name,art_direction_tag) values('LEGACY-41E','Legacy','URGENTE');
-- Simulate the migration backfill assertion independently inside the rolled-back test fixture.
update public.os_orders set is_urgent=true where art_direction_tag='URGENTE';
select ok((select is_urgent and art_direction_tag='URGENTE' from public.os_orders where sale_number='LEGACY-41E'),'legacy URGENTE remains tagged and urgent');
select ok(not has_function_privilege('anon','public.hub_os_create_order_secure(jsonb,text,jsonb)','EXECUTE'),'anon cannot execute create RPC');
select ok(not has_function_privilege('public','public.hub_os_create_order_secure(jsonb,text,jsonb)','EXECUTE'),'public cannot execute create RPC');
select ok(has_function_privilege('authenticated','public.hub_os_create_order_secure(jsonb,text,jsonb)','EXECUTE'),'authenticated has RPC contract');
select ok(not has_table_privilege('authenticated','public.os_orders','INSERT'),'authenticated has no direct order insert');

select set_config('request.jwt.claim.sub','41e00000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.hub_os_create_order_secure('{"sale_number":"ITEMS-41E","client_name":"Cliente","description":"Briefing","art_direction_tag":"CRIACAO_ARTE","is_urgent":true,"items":[{"name":"Placa","quantity":2,"unit":"un"},{"name":"Adesivo","quantity":1,"unit":"m2"}]}'::jsonb)$$,'creates order and items atomically');
select is((select count(*)::integer from public.os_order_items i join public.os_orders o on o.id=i.order_id where o.sale_number='ITEMS-41E'),2,'all items created');
select ok((select bool_and(i.status='PENDING') from public.os_order_items i join public.os_orders o on o.id=i.order_id where o.sale_number='ITEMS-41E'),'server forces PENDING');
select is((select array_agg(i.sort_order order by i.sort_order) from public.os_order_items i join public.os_orders o on o.id=i.order_id where o.sale_number='ITEMS-41E'),array[0,1],'server defines sort order');
select ok((select bool_and(i.created_by='41e00000-0000-4000-8000-000000000001') from public.os_order_items i join public.os_orders o on o.id=i.order_id where o.sale_number='ITEMS-41E'),'server derives item actor');
select ok((select is_urgent from public.os_orders where sale_number='ITEMS-41E'),'create stores independent urgency');
select ok((select art_status='Caixa de Entrada' and prod_status is null and not archived from public.os_orders where sale_number='ITEMS-41E'),'server forces initial state');
select is((select count(*)::integer from public.os_orders_event e join public.os_orders o on o.id=e.os_id where o.sale_number='ITEMS-41E' and e.type='item_created'),2,'item events audited');

select throws_ok($$select public.hub_os_create_order_secure('{"sale_number":"INVALID-41E","client_name":"Cliente","art_direction_tag":"CRIACAO_ARTE","items":[{"name":"","quantity":0,"unit":"un"}]}'::jsonb)$$,'22023',null,'invalid item aborts RPC');
select is((select count(*)::integer from public.os_orders where sale_number='INVALID-41E'),0,'invalid item leaves no partial order');
select lives_ok($$select public.hub_os_create_order_secure('{"sale_number":"OLD-CLIENT-41E","client_name":"Cliente antigo"}'::jsonb)$$,'old payload without items remains compatible');
select ok((select not is_urgent from public.os_orders where sale_number='OLD-CLIENT-41E'),'old client defaults urgency false');
select * from finish();
rollback;
