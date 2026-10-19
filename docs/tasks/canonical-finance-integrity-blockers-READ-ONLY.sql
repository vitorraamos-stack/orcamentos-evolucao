-- EvoluSystem finance integrity risks — READ ONLY.
-- Does not call any RPC, alter roles, create objects, or write financial data.
SELECT
  has_table_privilege('authenticated','public.os_orders','DELETE')
    AS authenticated_can_delete_os_orders,
  has_table_privilege('anon','public.os_orders','DELETE')
    AS anon_has_delete_grant,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='os_orders'
      AND policyname='os_orders_delete_admin'
      AND cmd='DELETE' AND roles=ARRAY['authenticated']::name[]
  ) AS admin_direct_delete_policy_exists,
  (SELECT count(*) FROM pg_trigger t
    WHERE t.tgrelid='public.os_orders'::regclass
      AND NOT t.tgisinternal AND (t.tgtype & 8)=8
  ) AS before_delete_trigger_count,
  EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='public.os_finance_installments'::regclass
      AND c.confrelid='public.os_orders'::regclass
      AND c.contype='f' AND c.confdeltype='c'
  ) AS installments_cascade_on_os_delete,
  EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='public.os_order_assets'::regclass
      AND c.confrelid='public.os_orders'::regclass
      AND c.contype='f' AND c.confdeltype='c'
  ) AS assets_cascade_on_os_delete,
  (SELECT md5(p.prosrc)
   FROM pg_proc p
   WHERE p.oid='public.finance_upsert_from_asset(uuid,uuid,text,date)'::regprocedure)
    AS active_finance_upsert_body_md5,
  EXISTS (
    SELECT 1 FROM pg_proc p WHERE
      p.oid='public.finance_upsert_from_asset(uuid,uuid,text,date)'::regprocedure
      AND md5(p.prosrc)='9bc1567dad2ab1640a82bf9893fc8ef3'
      AND p.prosecdef
  ) AS known_privileged_upsert_reset_version_active,
  EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.hub_os_delete_order_secure_v2(uuid,text,text,jsonb)'::regprocedure
      AND md5(p.prosrc)='90b1813c2c55dae92807c2329e2e5ee3'
  ) AS previously_reviewed_secure_delete_present,
  (SELECT count(*) FROM public.os_finance_installments)
    AS current_installment_count;
