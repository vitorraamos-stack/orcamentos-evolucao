-- Run with `supabase test db` after applying migrations.
begin;
select plan(35);

insert into public.os_orders(id,sale_number,client_name,art_status,prod_status)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','TEST-321A','Teste 3.2.1a','Produzir','Produção');
insert into public.os_order_items(id,order_id,name,status)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Item sob teste','PENDING');

-- Required-operation state machine.
insert into public.os_order_item_operations(id,item_id,work_center,status,is_required) values ('c0000000-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','PRINTING','PENDING',true);
select public.hub_os_recompute_item_production_status('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is((select status from public.os_order_items where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'PENDING','required PENDING makes item PENDING');
update public.os_order_item_operations set status='IN_PROGRESS',started_at=now() where id='c0000000-0000-4000-8000-000000000001'; select public.hub_os_recompute_item_production_status('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is((select status from public.os_order_items where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'IN_PROGRESS','required IN_PROGRESS makes item IN_PROGRESS');
update public.os_order_item_operations set status='BLOCKED',blocked_reason='Teste' where id='c0000000-0000-4000-8000-000000000001'; select public.hub_os_recompute_item_production_status('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is((select status from public.os_order_items where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'IN_PROGRESS','required BLOCKED makes item IN_PROGRESS');
update public.os_order_item_operations set status='COMPLETED',blocked_reason=null,completed_at=now() where id='c0000000-0000-4000-8000-000000000001'; select public.hub_os_recompute_item_production_status('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is((select status from public.os_order_items where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'READY','required COMPLETED makes item READY');
insert into public.os_order_item_operations(id,item_id,work_center,status,is_required) values ('c0000000-0000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','ASSEMBLY','PENDING',true); select public.hub_os_recompute_item_production_status('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is((select status from public.os_order_items where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'PENDING','completed plus pending required makes item PENDING');
update public.os_order_item_operations set status='COMPLETED',completed_at=now() where id='c0000000-0000-4000-8000-000000000002'; select public.hub_os_recompute_item_production_status('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is((select status from public.os_order_items where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'READY','all required completed makes item READY');
update public.os_order_item_operations set status='IN_PROGRESS',completed_at=null where id='c0000000-0000-4000-8000-000000000002'; select public.hub_os_recompute_item_production_status('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is((select status from public.os_order_items where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'IN_PROGRESS','reopening required operation makes READY item IN_PROGRESS');
update public.os_order_items set status='CANCELLED' where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; select public.hub_os_recompute_item_production_status('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is((select status from public.os_order_items where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'CANCELLED','cancelled item remains cancelled');

-- Optional operations and historical started_at.
delete from public.os_order_item_operations; update public.os_order_items set status='PENDING' where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
insert into public.os_order_item_operations(id,item_id,work_center,status,is_required) values ('c0000000-0000-4000-8000-000000000003','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','METALWORK','PENDING',false); select public.hub_os_recompute_item_production_status('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is((select status from public.os_order_items where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'READY','optional PENDING permits READY');
update public.os_order_item_operations set status='COMPLETED',completed_at=now() where id='c0000000-0000-4000-8000-000000000003'; select public.hub_os_recompute_item_production_status('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is((select status from public.os_order_items where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'READY','optional COMPLETED permits READY');
update public.os_order_item_operations set status='IN_PROGRESS',started_at=now(),completed_at=null where id='c0000000-0000-4000-8000-000000000003'; select public.hub_os_recompute_item_production_status('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is((select status from public.os_order_items where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'IN_PROGRESS','optional IN_PROGRESS prevents READY');
update public.os_order_item_operations set status='BLOCKED',blocked_reason='Teste' where id='c0000000-0000-4000-8000-000000000003'; select public.hub_os_recompute_item_production_status('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is((select status from public.os_order_items where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'IN_PROGRESS','optional BLOCKED prevents READY');
update public.os_order_item_operations set status='PENDING',blocked_reason=null where id='c0000000-0000-4000-8000-000000000003'; insert into public.os_order_item_operations(id,item_id,work_center,status,is_required,completed_at) values ('c0000000-0000-4000-8000-000000000004','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','PRINTING','COMPLETED',true,now()); select public.hub_os_recompute_item_production_status('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is((select status from public.os_order_items where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'READY','completed required plus optional PENDING permits READY');
update public.os_order_item_operations set status='IN_PROGRESS' where id='c0000000-0000-4000-8000-000000000003'; select public.hub_os_recompute_item_production_status('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is((select status from public.os_order_items where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'IN_PROGRESS','completed required plus optional IN_PROGRESS prevents READY');
update public.os_order_item_operations set status='BLOCKED',blocked_reason='Teste' where id='c0000000-0000-4000-8000-000000000003'; select public.hub_os_recompute_item_production_status('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is((select status from public.os_order_items where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'IN_PROGRESS','completed required plus optional BLOCKED prevents READY');
update public.os_order_item_operations set status='COMPLETED',blocked_reason=null,completed_at=now(),started_at=now() where id='c0000000-0000-4000-8000-000000000003'; select public.hub_os_recompute_item_production_status('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is((select status from public.os_order_items where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'READY','historical started_at on completed operation does not prevent READY');
delete from public.os_order_item_operations; update public.os_order_items set status='IN_PROGRESS' where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; select public.hub_os_recompute_item_production_status('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select is((select status from public.os_order_items where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'IN_PROGRESS','item without operations is not changed');

-- Guard predicates: production centers block Acabamento, FINISHING_QC starts blocking only Material Pronto.
insert into public.os_order_item_operations(item_id,work_center,status,is_required)
select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', center, 'PENDING', true from unnest(array['PRINTING','METALWORK','ASSEMBLY','CHANNEL_LETTER','ELECTRICAL_LIGHTING','EXTERNAL_PRODUCTION']) center;
select isnt((select count(*) from public.os_order_item_operations where is_required and work_center<>'FINISHING_QC' and status<>'COMPLETED' and deleted_at is null and work_center='PRINTING'),0::bigint,'PRINTING incomplete blocks Acabamento');
select isnt((select count(*) from public.os_order_item_operations where is_required and work_center<>'FINISHING_QC' and status<>'COMPLETED' and deleted_at is null and work_center='METALWORK'),0::bigint,'METALWORK incomplete blocks Acabamento');
select isnt((select count(*) from public.os_order_item_operations where is_required and work_center<>'FINISHING_QC' and status<>'COMPLETED' and deleted_at is null and work_center='ASSEMBLY'),0::bigint,'ASSEMBLY incomplete blocks Acabamento');
select isnt((select count(*) from public.os_order_item_operations where is_required and work_center<>'FINISHING_QC' and status<>'COMPLETED' and deleted_at is null and work_center='CHANNEL_LETTER'),0::bigint,'CHANNEL_LETTER incomplete blocks Acabamento');
select isnt((select count(*) from public.os_order_item_operations where is_required and work_center<>'FINISHING_QC' and status<>'COMPLETED' and deleted_at is null and work_center='ELECTRICAL_LIGHTING'),0::bigint,'ELECTRICAL_LIGHTING incomplete blocks Acabamento');
select isnt((select count(*) from public.os_order_item_operations where is_required and work_center<>'FINISHING_QC' and status<>'COMPLETED' and deleted_at is null and work_center='EXTERNAL_PRODUCTION'),0::bigint,'EXTERNAL_PRODUCTION incomplete blocks Acabamento');
update public.os_order_item_operations set status='COMPLETED',completed_at=now(); insert into public.os_order_item_operations(item_id,work_center,status,is_required) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','FINISHING_QC','PENDING',true);
select is((select count(*) from public.os_order_item_operations where is_required and work_center<>'FINISHING_QC' and status<>'COMPLETED' and deleted_at is null),0::bigint,'FINISHING_QC does not block Acabamento');
select isnt((select count(*) from public.os_order_item_operations where is_required and status<>'COMPLETED' and deleted_at is null),0::bigint,'FINISHING_QC incomplete blocks Material Pronto');
insert into public.os_order_item_operations(item_id,work_center,status,is_required) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','PRINTING','PENDING',false);
select is((select count(*) from public.os_order_item_operations where is_required and status<>'COMPLETED' and deleted_at is null and work_center='PRINTING'),0::bigint,'optional incomplete operation does not block Material Pronto');
update public.os_order_items set status='CANCELLED';
select is((select count(*) from public.os_order_item_operations op join public.os_order_items i on i.id=op.item_id where i.status<>'CANCELLED' and op.is_required and op.status<>'COMPLETED' and op.deleted_at is null),0::bigint,'cancelled item does not block Material Pronto');
delete from public.os_order_item_operations;
select is((select count(*) from public.os_order_item_operations where item_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and deleted_at is null),0::bigint,'legacy OS without operations keeps legacy flow');
insert into public.os_order_item_operations(item_id,work_center,status,is_required,deleted_at) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','PRINTING','PENDING',true,now());
select is((select count(*) from public.os_order_item_operations where is_required and status<>'COMPLETED' and deleted_at is null),0::bigint,'soft-deleted required operation does not block');

select ok(not has_function_privilege('public','public.hub_os_recompute_item_production_status(uuid)','EXECUTE'),'PUBLIC cannot execute recompute');
select ok(not has_function_privilege('anon','public.hub_os_recompute_item_production_status(uuid)','EXECUTE'),'anon cannot execute recompute');
select ok(not has_function_privilege('authenticated','public.hub_os_recompute_item_production_status(uuid)','EXECUTE'),'authenticated cannot execute recompute');
select ok(not has_function_privilege('public','public.hub_os_update_item_operation_secure(uuid,text,uuid,boolean,text,integer)','EXECUTE'),'PUBLIC cannot update operation');
select ok(not has_function_privilege('anon','public.hub_os_update_item_operation_secure(uuid,text,uuid,boolean,text,integer)','EXECUTE'),'anon cannot update operation');
select ok(has_function_privilege('authenticated','public.hub_os_update_item_operation_secure(uuid,text,uuid,boolean,text,integer)','EXECUTE'),'authenticated can execute validated update RPC');

select * from finish();
rollback;
