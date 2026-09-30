-- Hotfix 4.2b pickup runtime regression. Run with `supabase test db` after applying migrations.
begin;
select plan(14);

select has_function('public', 'order_flow_mark_retirado_and_finalize_secure', array['text','text','uuid','text'], 'pickup completion RPC signature remains unchanged');
select is((select prosecdef from pg_proc where oid = 'public.order_flow_mark_retirado_and_finalize_secure(text,text,uuid,text)'::regprocedure), true, 'pickup completion RPC remains SECURITY DEFINER');
select ok(has_function_privilege('authenticated', 'public.order_flow_mark_retirado_and_finalize_secure(text,text,uuid,text)', 'EXECUTE'), 'authenticated can execute pickup RPC');
select ok(not has_function_privilege('anon', 'public.order_flow_mark_retirado_and_finalize_secure(text,text,uuid,text)', 'EXECUTE'), 'anon cannot execute pickup RPC');
select ok(not has_function_privilege('public', 'public.order_flow_mark_retirado_and_finalize_secure(text,text,uuid,text)', 'EXECUTE'), 'PUBLIC cannot execute pickup RPC');

insert into auth.users (id, email)
values ('42b00000-0000-4000-8000-000000000001', 'pickup-hotfix-manager@test.local');
update public.profiles
set role = 'gerente'
where id = '42b00000-0000-4000-8000-000000000001';
insert into public.user_module_access (user_id, module_key)
values ('42b00000-0000-4000-8000-000000000001', 'hub_os');

insert into public.os_orders (
  id, sale_number, client_name, art_status, prod_status, logistic_type, archived
) values (
  '42b10000-0000-4000-8000-000000000001',
  'HF42B-1',
  'Retirada com fluxo existente',
  'Produzir',
  'Pronto / Avisar Cliente',
  'retirada',
  false
);

-- This pre-existing row reproduces the production path that raised SQLSTATE 42702.
insert into public.hub_os_order_flow_state (
  order_key, source_type, source_id, avisado_at, avisado_by
) values (
  'os_orders:42b10000-0000-4000-8000-000000000001',
  'os_orders',
  '42b10000-0000-4000-8000-000000000001',
  now(),
  '42b00000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.sub', '42b00000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.order_flow_mark_retirado_and_finalize_secure(
    'os_orders:42b10000-0000-4000-8000-000000000001',
    'os_orders',
    '42b10000-0000-4000-8000-000000000001',
    'Gerente Hotfix'
  )$$,
  'RPC updates an existing flow row without ambiguous order_key error'
);
select is((select count(*) from public.hub_os_order_flow_state where order_key = 'os_orders:42b10000-0000-4000-8000-000000000001'), 1::bigint, 'existing flow row is updated rather than duplicated');
select ok((select avisado_at is null and avisado_by is null from public.hub_os_order_flow_state where order_key = 'os_orders:42b10000-0000-4000-8000-000000000001'), 'notification fields are cleared');
select ok((select retirado_at is not null from public.hub_os_order_flow_state where order_key = 'os_orders:42b10000-0000-4000-8000-000000000001'), 'pickup timestamp is recorded');
select is((select retirado_by from public.hub_os_order_flow_state where order_key = 'os_orders:42b10000-0000-4000-8000-000000000001'), '42b00000-0000-4000-8000-000000000001'::uuid, 'pickup actor is recorded');
select is((select prod_status from public.os_orders where id = '42b10000-0000-4000-8000-000000000001'), 'Finalizados', 'pickup finalizes the order');

create temporary table pickup_42b_first_result as
select
  retirado_at,
  retirado_by,
  (select count(*) from public.os_orders_event where os_id = '42b10000-0000-4000-8000-000000000001') as event_count
from public.hub_os_order_flow_state
where order_key = 'os_orders:42b10000-0000-4000-8000-000000000001';

select ok((select already_retirado from public.order_flow_mark_retirado_and_finalize_secure(
  'os_orders:42b10000-0000-4000-8000-000000000001',
  'os_orders',
  '42b10000-0000-4000-8000-000000000001',
  'Gerente Hotfix'
)), 'second call reports the pickup as already completed');
select ok((select first.retirado_at = flow.retirado_at and first.retirado_by = flow.retirado_by from pickup_42b_first_result first cross join public.hub_os_order_flow_state flow where flow.order_key = 'os_orders:42b10000-0000-4000-8000-000000000001'), 'second call preserves the original pickup timestamp and actor');
select is((select count(*) from public.os_orders_event where os_id = '42b10000-0000-4000-8000-000000000001'), (select event_count from pickup_42b_first_result), 'second call does not duplicate history events');

select * from finish();
rollback;
