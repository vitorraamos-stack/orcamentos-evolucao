-- EvoluSystem — canonical OS parent direct-DELETE hardening.
-- REVIEW CANDIDATE. NOT APPLIED. DO NOT PLACE IN supabase/migrations.
--
-- Current risk: the authenticated RLS policy allows direct DELETE on
-- public.os_orders to admins with hub_os. The client-side secure deletion
-- RPC performs retention checks that ordinary DELETE can bypass. Foreign
-- keys ON DELETE CASCADE can remove the associated finance installments
-- and receipt-file metadata.
--
-- Proposal: revoke direct DELETE for anon/authenticated and drop the
-- corresponding direct DELETE policy. Keep other privileges/policies,
-- SECURITY DEFINER governance RPCs and service_role grants unchanged.
-- Does not protect direct DELETE of child finance rows (separate PR #523).

DO $preflight$
DECLARE
 v_policy text;
BEGIN
 IF current_user <> 'postgres' THEN
   RAISE EXCEPTION 'OS_DELETE_GUARD_UNEXPECTED_EXECUTOR'
     USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM pg_class c
   WHERE c.oid='public.os_orders'::regclass
     AND c.relkind='r'
     AND c.relrowsecurity
     AND pg_get_userbyid(c.relowner)='postgres'
 ) THEN
   RAISE EXCEPTION 'OS_DELETE_GUARD_PARENT_OWNER_RLS_DRIFT'
     USING ERRCODE='55000';
 END IF;
 IF NOT (has_table_privilege('anon','public.os_orders','DELETE')
     AND has_table_privilege('authenticated','public.os_orders','DELETE')
     AND has_table_privilege('service_role','public.os_orders','DELETE')
     AND NOT pg_has_role('authenticated','service_role','MEMBER')
     AND NOT pg_has_role('anon','service_role','MEMBER')
 ) THEN
   RAISE EXCEPTION 'OS_DELETE_GUARD_CURRENT_ACL_DRIFT'
     USING ERRCODE='55000';
 END IF;
 IF EXISTS (
   SELECT 1 FROM pg_class c
   CROSS JOIN LATERAL aclexplode(c.relacl) acl
   WHERE c.oid='public.os_orders'::regclass AND acl.grantee=0
     AND acl.privilege_type='DELETE'
 ) THEN
   RAISE EXCEPTION 'OS_DELETE_GUARD_PUBLIC_DELETE_DRIFT'
     USING ERRCODE='55000';
 END IF;
 IF (SELECT count(*) FROM pg_policies
     WHERE schemaname='public' AND tablename='os_orders'
       AND cmd='DELETE') <> 1
 OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='os_orders'
      AND policyname='os_orders_delete_admin'
      AND cmd='DELETE'
      AND roles=ARRAY['authenticated']::name[]
      AND qual='(has_module_access(auth.uid(), ''hub_os''::text) AND is_admin(auth.uid()))'
 ) THEN
   RAISE EXCEPTION 'OS_DELETE_GUARD_DELETE_POLICY_DRIFT'
     USING ERRCODE='55000';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM pg_proc p
   WHERE p.oid='public.hub_os_delete_order_secure_v2(uuid,text,text,jsonb)'::regprocedure
     AND pg_get_userbyid(p.proowner)='postgres'
     AND p.prosecdef
     AND md5(p.prosrc)='90b1813c2c55dae92807c2329e2e5ee3'
 ) OR NOT EXISTS (
   SELECT 1 FROM pg_proc p
   WHERE p.oid='public.hub_os_delete_order_secure(uuid,text,jsonb)'::regprocedure
     AND pg_get_userbyid(p.proowner)='postgres'
     AND p.prosecdef
     AND md5(p.prosrc)='7f48099f8f2aa6ee35241aa81bed70b1'
 ) OR NOT EXISTS (
   SELECT 1 FROM pg_proc p
   WHERE p.oid='public.hub_os_delete_order_preview_secure(uuid)'::regprocedure
     AND pg_get_userbyid(p.proowner)='postgres'
     AND p.prosecdef
     AND md5(p.prosrc)='3ceb05928ebf82a45853575d6b87d00e'
 ) THEN
   RAISE EXCEPTION 'OS_DELETE_GUARD_GOVERNANCE_RPC_DRIFT'
     USING ERRCODE='55000';
 END IF;
 IF NOT (
    has_function_privilege('authenticated',
      'public.hub_os_delete_order_secure_v2(uuid,text,text,jsonb)','EXECUTE')
    AND has_function_privilege('authenticated',
      'public.hub_os_delete_order_preview_secure(uuid)','EXECUTE')
    AND NOT has_function_privilege('anon',
      'public.hub_os_delete_order_secure_v2(uuid,text,text,jsonb)','EXECUTE')
    AND has_function_privilege('service_role',
      'public.hub_os_delete_order_secure_v2(uuid,text,text,jsonb)','EXECUTE')
 ) THEN
   RAISE EXCEPTION 'OS_DELETE_GUARD_FUNCTION_EXECUTE_DRIFT'
     USING ERRCODE='55000';
 END IF;
 IF (SELECT count(*) FROM pg_constraint
      WHERE contype='f'
        AND confrelid='public.os_orders'::regclass
        AND conrelid IN (
          'public.os_finance_installments'::regclass,
          'public.os_order_assets'::regclass
        )
        AND confdeltype='c'
        AND convalidated
 ) <> 2 THEN
   RAISE EXCEPTION 'OS_DELETE_GUARD_FINANCIAL_FK_DRIFT'
     USING ERRCODE='55000';
 END IF;
END;
$preflight$;

-- Only direct browser-facing role grants/policy change.
-- Privileged SECURITY DEFINER delete RPC continues executing as postgres.
REVOKE DELETE ON TABLE public.os_orders FROM anon, authenticated;
DROP POLICY os_orders_delete_admin ON public.os_orders;

DO $postcheck$
BEGIN
 IF has_table_privilege('anon','public.os_orders','DELETE')
    OR has_table_privilege('authenticated','public.os_orders','DELETE')
    OR NOT has_table_privilege('service_role','public.os_orders','DELETE')
    OR NOT has_table_privilege('authenticated','public.os_orders','SELECT')
    OR NOT has_table_privilege('authenticated','public.os_orders','UPDATE')
 THEN
   RAISE EXCEPTION 'OS_DELETE_GUARD_CLIENT_GRANTS_POSTCHECK'
     USING ERRCODE='55000';
 END IF;
 IF EXISTS (
   SELECT 1 FROM pg_policies p
   WHERE p.schemaname='public'
     AND p.tablename='os_orders' AND p.cmd='DELETE'
 ) OR NOT EXISTS (
   SELECT 1 FROM pg_policies p
   WHERE p.schemaname='public' AND p.tablename='os_orders'
     AND p.policyname='os_orders_select_authenticated'
     AND p.cmd='SELECT'
 ) OR NOT EXISTS (
   SELECT 1 FROM pg_policies p
   WHERE p.schemaname='public' AND p.tablename='os_orders'
     AND p.policyname='os_orders_update_manager_only'
     AND p.cmd='UPDATE'
 ) THEN
   RAISE EXCEPTION 'OS_DELETE_GUARD_RLS_POLICIES_POSTCHECK'
     USING ERRCODE='55000';
 END IF;
 IF NOT (
    has_function_privilege('authenticated',
      'public.hub_os_delete_order_secure_v2(uuid,text,text,jsonb)','EXECUTE')
    AND has_function_privilege('authenticated',
      'public.hub_os_delete_order_preview_secure(uuid)','EXECUTE')
    AND NOT has_function_privilege('anon',
      'public.hub_os_delete_order_secure_v2(uuid,text,text,jsonb)','EXECUTE')
 ) THEN
   RAISE EXCEPTION 'OS_DELETE_GUARD_GOVERNANCE_RPC_POSTCHECK'
     USING ERRCODE='55000';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM pg_proc p
   WHERE p.oid='public.hub_os_delete_order_secure_v2(uuid,text,text,jsonb)'::regprocedure
     AND p.prosecdef
     AND pg_get_userbyid(p.proowner)='postgres'
     AND md5(p.prosrc)='90b1813c2c55dae92807c2329e2e5ee3'
 ) THEN
   RAISE EXCEPTION 'OS_DELETE_GUARD_GOVERNANCE_CODE_CHANGED'
     USING ERRCODE='55000';
 END IF;
END;
$postcheck$;

-- REVIEW ONLY. No authorization to apply this candidate to production.
