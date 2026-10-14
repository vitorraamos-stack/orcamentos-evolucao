-- Phase 19Q: remove non-manager DELETE access on the legacy public.os table.
-- PROPOSAL ONLY: requires separate authorization for production migration and merge.
-- Legacy OS has ON DELETE CASCADE dependencies (os_event, os_payment_proof).
-- Scope is exactly ONE RLS policy. No changes to SECURITY DEFINER RPCs, data, grants,
-- backend triggers, or the current public.os_orders policy.
-- Consistent with current os_orders_delete_admin policy, but requires manager role
-- via the existing public.is_manager(auth.uid()) helper and Hub OS module access.
-- Related legacy DELETE policies on os_event, os_payment_proof and os_status
-- remain unchanged; review in a separate stage before considering bulk changes.

DO $preflight$
BEGIN
  IF to_regclass('public.os') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='os'
        AND c.relkind IN ('r','p') AND c.relrowsecurity
        AND has_table_privilege('authenticated',c.oid,'DELETE')
    )
  THEN RAISE EXCEPTION '19Q_ABORTED_LEGACY_OS_TABLE_CHANGED'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='os'
      AND policyname='os_delete' AND cmd='DELETE'
      AND roles=ARRAY['authenticated']::name[]
      AND qual='has_module_access(auth.uid(), ''hub_os''::text)'
      AND with_check IS NULL
  ) OR (
    SELECT COUNT(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='os' AND cmd='DELETE'
  )<>1
  THEN RAISE EXCEPTION '19Q_ABORTED_OS_DELETE_POLICY_CHANGED'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='os_orders'
      AND policyname='os_orders_delete_admin' AND cmd='DELETE'
      AND roles=ARRAY['authenticated']::name[]
      AND qual='(has_module_access(auth.uid(), ''hub_os''::text) AND is_admin(auth.uid()))'
  )
  THEN RAISE EXCEPTION '19Q_ABORTED_CURRENT_OS_DELETE_REFERENCE_CHANGED'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.has_module_access(uuid,text)'::regprocedure
      AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres'
      AND md5(p.prosrc)='5855f6a54a28a3f37f3c2702a5b0ac82'
      AND p.proconfig=ARRAY['search_path=public']::text[]
      AND has_function_privilege('authenticated',p.oid,'EXECUTE')
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.is_manager(uuid)'::regprocedure
      AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres'
      AND md5(p.prosrc)='6c4acc49a3edd1a6b8b775f05e1e1e4f'
      AND p.proconfig=ARRAY['search_path=public']::text[]
      AND has_function_privilege('authenticated',p.oid,'EXECUTE')
  )
  THEN RAISE EXCEPTION '19Q_ABORTED_RLS_HELPERS_CHANGED'; END IF;

END;
$preflight$;

-- Existing policy name, command and role stay unchanged. Only USING is narrowed.
ALTER POLICY os_delete ON public.os
  USING (public.has_module_access(auth.uid(), 'hub_os') AND public.is_manager(auth.uid()));

DO $postcheck$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='os'
      AND policyname='os_delete' AND cmd='DELETE'
      AND roles=ARRAY['authenticated']::name[]
      AND qual='(has_module_access(auth.uid(), ''hub_os''::text) AND is_manager(auth.uid()))'
      AND with_check IS NULL
  ) OR (
    SELECT COUNT(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='os' AND cmd='DELETE'
  )<>1
  THEN RAISE EXCEPTION '19Q_ABORTED_POSTCONDITION_OS_DELETE'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='os_orders'
      AND policyname='os_orders_delete_admin' AND cmd='DELETE'
      AND roles=ARRAY['authenticated']::name[]
      AND qual='(has_module_access(auth.uid(), ''hub_os''::text) AND is_admin(auth.uid()))'
  )
  THEN RAISE EXCEPTION '19Q_ABORTED_POSTCONDITION_ACTIVE_OS_DELETE'; END IF;

END;
$postcheck$;
