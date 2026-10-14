-- Phase 19S: preserve failed-upload cleanup without allowing deletion of submitted financial proofs.
-- PROPOSAL ONLY. Production application and GitHub merge require two separate explicit authorizations.
-- The legacy UI creates a proof row before uploading, then deletes it only if the R2 upload fails.
-- Successful uploads attach metadata; successful submissions append an immutable-from-nonmanager
-- os_event PAYMENT_SUBMITTED event. No application changes or new columns are needed.
-- A SECURITY INVOKER BEFORE INSERT/UPDATE trigger stamps creation provenance and prevents
-- authenticated actors from forging ownership/time or resetting already populated upload metadata.
-- UPDATE and DELETE RLS are restricted independently. DELETE allows only a temporary
-- unsubmitted proof created by the authenticated user, with no attached file or synced metadata.
-- Revoke TRUNCATE/TRIGGER privileges that bypass or threaten row-level security.
-- Existing status and event policies (19R), OS delete policy (19Q), and operational tables untouched.

DO $preflight$
DECLARE
  v_acl text;
BEGIN
  IF to_regclass('public.os_payment_proof') IS NULL
    OR to_regclass('public.os_event') IS NULL
    OR to_regprocedure('public.guard_legacy_payment_proof_mutations()') IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid='public.os_payment_proof'::regclass AND NOT t.tgisinternal
    )
  THEN RAISE EXCEPTION '19S_ABORTED_UNEXPECTED_PROOF_SCHEMA_OR_TRIGGER'; END IF;

  SELECT c.relacl::text INTO v_acl
  FROM pg_class c
  WHERE c.oid='public.os_payment_proof'::regclass
    AND c.relkind='r' AND c.relrowsecurity
    AND pg_get_userbyid(c.relowner)='postgres';
  IF v_acl IS DISTINCT FROM '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'
    OR NOT has_table_privilege('authenticated','public.os_payment_proof','TRUNCATE')
    OR NOT has_table_privilege('authenticated','public.os_payment_proof','TRIGGER')
    OR NOT has_table_privilege('anon','public.os_payment_proof','TRUNCATE')
    OR NOT has_table_privilege('anon','public.os_payment_proof','TRIGGER')
    OR NOT has_table_privilege('service_role','public.os_payment_proof','TRIGGER')
  THEN RAISE EXCEPTION '19S_ABORTED_TABLE_ACL_DRIFT'; END IF;

  IF (SELECT count(*) FROM public.os_payment_proof)<>0
  THEN RAISE EXCEPTION '19S_ABORTED_EXISTING_PROOFS_NEED_DATA_REVIEW'; END IF;

  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='os_payment_proof')<>4
    OR (SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='os_payment_proof' AND cmd='DELETE')<>1
  THEN RAISE EXCEPTION '19S_ABORTED_PROOF_POLICY_COUNT_DRIFT'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='os_payment_proof'
      AND policyname='os_payment_delete' AND cmd='DELETE'
      AND roles=ARRAY['authenticated']::name[]
      AND qual='has_module_access(auth.uid(), ''hub_os''::text)' AND with_check IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='os_payment_proof'
      AND policyname='os_payment_update' AND cmd='UPDATE'
      AND roles=ARRAY['authenticated']::name[]
      AND qual='has_module_access(auth.uid(), ''hub_os''::text)'
      AND with_check='has_module_access(auth.uid(), ''hub_os''::text)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='os_payment_proof'
      AND policyname='os_payment_insert' AND cmd='INSERT'
      AND roles=ARRAY['authenticated']::name[]
      AND with_check='has_module_access(auth.uid(), ''hub_os''::text)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='os_payment_proof'
      AND policyname='os_payment_read' AND cmd='SELECT'
      AND roles=ARRAY['authenticated']::name[]
      AND qual='has_module_access(auth.uid(), ''hub_os''::text)'
  )
  THEN RAISE EXCEPTION '19S_ABORTED_PROOF_POLICY_DRIFT'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.has_module_access(uuid,text)'::regprocedure
      AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres'
      AND p.proconfig=ARRAY['search_path=public']::text[]
      AND md5(p.prosrc)='5855f6a54a28a3f37f3c2702a5b0ac82'
      AND has_function_privilege('authenticated',p.oid,'EXECUTE')
  ) THEN RAISE EXCEPTION '19S_ABORTED_ACCESS_HELPER_DRIFT'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='os_event'
      AND policyname='os_event_delete' AND cmd='DELETE'
      AND qual='(has_module_access(auth.uid(), ''hub_os''::text) AND is_manager(auth.uid()))'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='os'
      AND policyname='os_delete' AND cmd='DELETE'
      AND qual='(has_module_access(auth.uid(), ''hub_os''::text) AND is_manager(auth.uid()))'
  ) THEN RAISE EXCEPTION '19S_ABORTED_LEGACY_EVENT_RETENTION_DRIFT'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='os_event'
      AND column_name='payload' AND data_type='jsonb'
  ) THEN RAISE EXCEPTION '19S_ABORTED_EVENT_PAYLOAD_SCHEMA_DRIFT'; END IF;
END;
$preflight$;

-- Scope 1: stamp authenticated owner/timestamp; reject tampering with proof provenance
-- and reverting any previously populated attachment or synchronization metadata.
CREATE FUNCTION public.guard_legacy_payment_proof_mutations()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO ''
AS $guard$
BEGIN
  IF current_user = 'authenticated' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION '19S_AUTH_REQUIRED' USING ERRCODE='42501';
    END IF;

    IF TG_OP = 'INSERT' THEN
      NEW.created_by := auth.uid();
      NEW.created_at := now();
    ELSIF TG_OP = 'UPDATE' THEN
      IF OLD.created_by IS DISTINCT FROM auth.uid()
        OR NEW.id IS DISTINCT FROM OLD.id
        OR NEW.os_id IS DISTINCT FROM OLD.os_id
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
      THEN RAISE EXCEPTION '19S_PROOF_PROVENANCE_IMMUTABLE' USING ERRCODE='42501'; END IF;

      IF (OLD.status IS DISTINCT FROM 'PENDING' AND NEW.status='PENDING')
        OR (OLD.attachment_path IS NOT NULL AND NEW.attachment_path IS DISTINCT FROM OLD.attachment_path)
        OR (OLD.attachment_url IS NOT NULL AND NEW.attachment_url IS DISTINCT FROM OLD.attachment_url)
        OR (OLD.storage_bucket IS NOT NULL AND NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket)
        OR (OLD.r2_etag IS NOT NULL AND NEW.r2_etag IS DISTINCT FROM OLD.r2_etag)
        OR (OLD.content_type IS NOT NULL AND NEW.content_type IS DISTINCT FROM OLD.content_type)
        OR (OLD.size_bytes IS NOT NULL AND NEW.size_bytes IS DISTINCT FROM OLD.size_bytes)
        OR (OLD.synced_to_smb_at IS NOT NULL AND NEW.synced_to_smb_at IS DISTINCT FROM OLD.synced_to_smb_at)
        OR (OLD.smb_path IS NOT NULL AND NEW.smb_path IS DISTINCT FROM OLD.smb_path)
      THEN RAISE EXCEPTION '19S_UPLOADED_PROOF_METADATA_IMMUTABLE' USING ERRCODE='42501'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$guard$;

-- Harden callable privileges; existing and future backend trigger maintenance keeps service access.
REVOKE EXECUTE ON FUNCTION public.guard_legacy_payment_proof_mutations()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_legacy_payment_proof_mutations()
  TO service_role;

CREATE TRIGGER trg_guard_legacy_payment_proof_mutations
BEFORE INSERT OR UPDATE ON public.os_payment_proof
FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_payment_proof_mutations();

-- Scope 2: owner-only update and narrowly scoped rollback cleanup.
ALTER POLICY os_payment_update ON public.os_payment_proof
  USING (public.has_module_access(auth.uid(), 'hub_os') AND created_by=auth.uid())
  WITH CHECK (public.has_module_access(auth.uid(), 'hub_os') AND created_by=auth.uid());

ALTER POLICY os_payment_delete ON public.os_payment_proof
  USING (
    public.has_module_access(auth.uid(), 'hub_os')
    AND created_by=auth.uid()
    AND status='PENDING'
    AND created_at >= now() - interval '24 hours'
    AND created_at <= now()
    AND attachment_path IS NULL
    AND attachment_url IS NULL
    AND storage_bucket IS NULL
    AND r2_etag IS NULL
    AND content_type IS NULL
    AND size_bytes IS NULL
    AND synced_to_smb_at IS NULL
    AND smb_path IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.os_event e
      WHERE e.os_id=os_payment_proof.os_id
        AND e.type='PAYMENT_SUBMITTED'
        AND e.payload->>'payment_id'=os_payment_proof.id::text
    )
  );

-- RLS does NOT protect TRUNCATE. Prevent user-level TRUNCATE and user-created triggers.
REVOKE TRUNCATE, TRIGGER ON TABLE public.os_payment_proof
  FROM PUBLIC, anon, authenticated;

DO $postcheck$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.guard_legacy_payment_proof_mutations()'::regprocedure
      AND NOT p.prosecdef
      AND p.prorettype='trigger'::regtype
      AND pg_get_userbyid(p.proowner)='postgres'
      AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
      AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND has_function_privilege('service_role',p.oid,'EXECUTE')
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid='public.os_payment_proof'::regclass
      AND NOT t.tgisinternal
      AND t.tgname='trg_guard_legacy_payment_proof_mutations'
      AND t.tgfoid='public.guard_legacy_payment_proof_mutations()'::regprocedure
      AND t.tgenabled='O'
  ) OR (SELECT count(*) FROM pg_trigger t
         WHERE t.tgrelid='public.os_payment_proof'::regclass
           AND NOT t.tgisinternal)<>1
  THEN RAISE EXCEPTION '19S_ABORTED_POSTCONDITION_PROVENANCE_TRIGGER'; END IF;

  IF has_table_privilege('anon','public.os_payment_proof','TRUNCATE')
    OR has_table_privilege('authenticated','public.os_payment_proof','TRUNCATE')
    OR has_table_privilege('anon','public.os_payment_proof','TRIGGER')
    OR has_table_privilege('authenticated','public.os_payment_proof','TRIGGER')
    OR NOT has_table_privilege('service_role','public.os_payment_proof','TRUNCATE')
    OR NOT has_table_privilege('service_role','public.os_payment_proof','TRIGGER')
  THEN RAISE EXCEPTION '19S_ABORTED_POSTCONDITION_TABLE_GRANTS'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='os_payment_proof'
      AND policyname='os_payment_update' AND cmd='UPDATE'
      AND roles=ARRAY['authenticated']::name[]
      AND qual='(has_module_access(auth.uid(), ''hub_os''::text) AND (created_by = auth.uid()))'
      AND with_check='(has_module_access(auth.uid(), ''hub_os''::text) AND (created_by = auth.uid()))'
  ) THEN RAISE EXCEPTION '19S_ABORTED_POSTCONDITION_UPDATE_OWNER'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='os_payment_proof'
      AND policyname='os_payment_delete' AND cmd='DELETE'
      AND roles=ARRAY['authenticated']::name[]
      AND qual LIKE '%(created_by = auth.uid())%'
      AND qual LIKE '%PAYMENT_SUBMITTED%'
      AND qual LIKE '%24 hours%'
      AND qual LIKE '%attachment_path IS NULL%'
      AND qual LIKE '%synced_to_smb_at IS NULL%'
  ) THEN RAISE EXCEPTION '19S_ABORTED_POSTCONDITION_DELETE_PENDING_ONLY'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='os_payment_proof'
      AND policyname='os_payment_insert' AND cmd='INSERT'
      AND with_check='has_module_access(auth.uid(), ''hub_os''::text)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='os_payment_proof'
      AND policyname='os_payment_read' AND cmd='SELECT'
      AND qual='has_module_access(auth.uid(), ''hub_os''::text)'
  ) OR (SELECT count(*) FROM pg_policies
        WHERE schemaname='public' AND tablename='os_payment_proof')<>4
  THEN RAISE EXCEPTION '19S_ABORTED_POSTCONDITION_OTHER_POLICIES_CHANGED'; END IF;

  IF (SELECT count(*) FROM public.os_payment_proof)<>0
  THEN RAISE EXCEPTION '19S_ABORTED_POSTCONDITION_EXISTING_PROOFS'; END IF;
END;
$postcheck$;
