-- EvoluSystem — canonical parent-delete baseline (READ ONLY)
-- No deletion, role impersonation, RPC execution, or data changes.
SELECT
 current_user AS executed_as,
 has_table_privilege('anon','public.os_orders','DELETE')
   AS anon_direct_delete_granted,
 has_table_privilege('authenticated','public.os_orders','DELETE')
   AS authenticated_direct_delete_granted,
 has_table_privilege('service_role','public.os_orders','DELETE')
   AS service_delete_preserved,
 EXISTS(
   SELECT 1 FROM pg_policies
   WHERE schemaname='public' AND tablename='os_orders'
     AND policyname='os_orders_delete_admin'
     AND cmd='DELETE'
 ) AS active_admin_direct_delete_policy,
 (SELECT md5(prosrc) FROM pg_proc
   WHERE oid='public.hub_os_delete_order_secure_v2(uuid,text,text,jsonb)'::regprocedure
 ) AS server_governed_delete_rpc_hash,
 (SELECT count(*) FROM pg_constraint
   WHERE contype='f' AND confrelid='public.os_orders'::regclass
     AND conrelid IN ('public.os_finance_installments'::regclass,
                      'public.os_order_assets'::regclass)
     AND confdeltype='c' AND convalidated
 ) AS finance_and_assets_cascades,
 (SELECT count(*) FROM public.os_finance_installments) AS financial_installment_count,
 (SELECT count(*) FROM public.os_orders) AS os_orders_count;
