-- Phase 19R: limit direct DELETE on legacy event and status tables to Hub OS managers.
-- PROPOSAL ONLY. Applying to production and merging into main require separate explicit approvals.
-- Only the DELETE policies on public.os_event and public.os_status are narrowed.
-- public.os_payment_proof DELETE is intentionally UNCHANGED: the frontend invokes deletePaymentProof()
-- as rollback cleanup if the payment proof upload fails (src/modules/hub-os/pages/OsDetailPage.tsx).
-- Deleting / mutating data, changing function grants/bodies, triggers, or other policies is prohibited.
-- The seven os_status records remain untouched, as do SELECT/INSERT/UPDATE policies.
-- The current public.os_orders and the previously hardened legacy public.os policies remain unchanged.

DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.has_module_access(uuid,text)'::regprocedure
      AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres'
      AND p.proconfig=ARRAY['search_path=public']::text[]
      AND md5(p.prosrc)='5855f6a54a28a3f37f3c2702a5b0ac82'
      AND has_function_privilege('authenticated',p.oid,'EXECUTE')
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.is_manager(uuid)'::regprocedure
      AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres'
      AND p.proconfig=ARRAY['search_path=public']::text[]
      AND md5(p.prosrc)='6c4acc49a3edd1a6b8b775f05e1e1e4f'
      AND has_function_privilege('authenticated',p.oid,'EXECUTE')
  ) THEN RAISE EXCEPTION '19R_ABORTED_SECURITY_HELPERS_CHANGED'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='os'
      AND policyname='os_delete' AND cmd='DELETE'
      AND roles=ARRAY['authenticated']::name[]
      AND qual='(has_module_access(auth.uid(), ''hub_os''::text) AND is_manager(auth.uid()))'
  ) THEN RAISE EXCEPTION '19R_ABORTED_19Q_LEGACY_OS_CHANGED'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='os_payment_proof'
      AND policyname='os_payment_delete' AND cmd='DELETE'
      AND roles=ARRAY['authenticated']::name[]
      AND qual='has_module_access(auth.uid(), ''hub_os''::text)'
  ) THEN RAISE EXCEPTION '19R_ABORTED_PAYMENT_PROOF_CLEANUP_POLICY_CHANGED'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON c.relname=p.tablename
    JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname=p.schemaname
    WHERE p.schemaname='public' AND p.tablename='os_event'
      AND p.policyname='os_event_delete' AND p.cmd='DELETE'
      AND p.roles=ARRAY['authenticated']::name[]
      AND p.qual='has_module_access(auth.uid(), ''hub_os''::text)'
      AND p.with_check IS NULL AND c.relrowsecurity AND c.relkind='r'
  ) OR (SELECT COUNT(*) FROM pg_policies
        WHERE schemaname='public' AND tablename='os_event' AND cmd='DELETE')<>1
  THEN RAISE EXCEPTION '19R_ABORTED_PRECONDITION_OS_EVENT'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON c.relname=p.tablename
    JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname=p.schemaname
    WHERE p.schemaname='public' AND p.tablename='os_status'
      AND p.policyname='os_status_delete' AND p.cmd='DELETE'
      AND p.roles=ARRAY['authenticated']::name[]
      AND p.qual='has_module_access(auth.uid(), ''hub_os''::text)'
      AND p.with_check IS NULL AND c.relrowsecurity AND c.relkind='r'
  ) OR (SELECT COUNT(*) FROM pg_policies
        WHERE schemaname='public' AND tablename='os_status' AND cmd='DELETE')<>1
  THEN RAISE EXCEPTION '19R_ABORTED_PRECONDITION_OS_STATUS'; END IF;

END;
$preflight$;

-- Narrow the two DELETE policies only, retaining names, command and role.
ALTER POLICY os_event_delete ON public.os_event
  USING (public.has_module_access(auth.uid(), 'hub_os') AND public.is_manager(auth.uid()));
ALTER POLICY os_status_delete ON public.os_status
  USING (public.has_module_access(auth.uid(), 'hub_os') AND public.is_manager(auth.uid()));

DO $postcheck$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON c.relname=p.tablename
    JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname=p.schemaname
    WHERE p.schemaname='public' AND p.tablename='os_event'
      AND p.policyname='os_event_delete' AND p.cmd='DELETE'
      AND p.roles=ARRAY['authenticated']::name[]
      AND p.qual='(has_module_access(auth.uid(), ''hub_os''::text) AND is_manager(auth.uid()))'
      AND p.with_check IS NULL AND c.relrowsecurity AND c.relkind='r'
  ) OR (SELECT COUNT(*) FROM pg_policies
        WHERE schemaname='public' AND tablename='os_event' AND cmd='DELETE')<>1
  THEN RAISE EXCEPTION '19R_ABORTED_POSTCONDITION_OS_EVENT'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON c.relname=p.tablename
    JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname=p.schemaname
    WHERE p.schemaname='public' AND p.tablename='os_status'
      AND p.policyname='os_status_delete' AND p.cmd='DELETE'
      AND p.roles=ARRAY['authenticated']::name[]
      AND p.qual='(has_module_access(auth.uid(), ''hub_os''::text) AND is_manager(auth.uid()))'
      AND p.with_check IS NULL AND c.relrowsecurity AND c.relkind='r'
  ) OR (SELECT COUNT(*) FROM pg_policies
        WHERE schemaname='public' AND tablename='os_status' AND cmd='DELETE')<>1
  THEN RAISE EXCEPTION '19R_ABORTED_POSTCONDITION_OS_STATUS'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='os_payment_proof'
      AND policyname='os_payment_delete' AND cmd='DELETE'
      AND roles=ARRAY['authenticated']::name[]
      AND qual='has_module_access(auth.uid(), ''hub_os''::text)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='os'
      AND policyname='os_delete' AND cmd='DELETE'
      AND roles=ARRAY['authenticated']::name[]
      AND qual='(has_module_access(auth.uid(), ''hub_os''::text) AND is_manager(auth.uid()))'
  )
  THEN RAISE EXCEPTION '19R_ABORTED_POSTCONDITION_REFERENCE_POLICIES'; END IF;

END;
$postcheck$;
