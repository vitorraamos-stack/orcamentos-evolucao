-- Phase 19T: disallow changing financial data after a legacy proof is created.
-- PROPOSAL ONLY. Production migration and merge require separate explicit authorizations.
-- No policies, grants, triggers, table data, API or UI changes. One function body is replaced.
-- Keeps 19S provenance restrictions, failed-upload cleanup and first R2 metadata update.
-- Existing legacy UI: create pending proof -> upload R2 -> update attachment -> PAYMENT_SUBMITTED.
-- An event also finalizes payments without attachments; immutable thereafter for authenticated.
-- Existing service_role/agent execution is not affected (guard only checks current_user='authenticated').

DO $preflight$
BEGIN
  IF to_regprocedure('public.guard_legacy_payment_proof_mutations()') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid='public.guard_legacy_payment_proof_mutations()'::regprocedure
        AND md5(p.prosrc)='7eb6ece017db3dbcdb44a1aaeb352a3a'
        AND NOT p.prosecdef
        AND pg_get_userbyid(p.proowner)='postgres'
        AND p.prorettype='trigger'::regtype
        AND p.proconfig=ARRAY['search_path=""']::text[]
        AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}'
        AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
        AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
        AND has_function_privilege('service_role',p.oid,'EXECUTE')
    )
  THEN RAISE EXCEPTION '19T_ABORTED_GUARD_FUNCTION_DRIFT'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid='public.os_payment_proof'::regclass
      AND t.tgname='trg_guard_legacy_payment_proof_mutations'
      AND NOT t.tgisinternal AND t.tgenabled='O'
      AND t.tgfoid='public.guard_legacy_payment_proof_mutations()'::regprocedure
  ) OR (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid='public.os_payment_proof'::regclass
                AND NOT t.tgisinternal)<>1
  THEN RAISE EXCEPTION '19T_ABORTED_GUARD_TRIGGER_DRIFT'; END IF;

  IF (SELECT count(*) FROM public.os_payment_proof)<>0
  THEN RAISE EXCEPTION '19T_ABORTED_EXISTING_PROOFS_NEED_REVIEW'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='os_payment_proof'
      AND policyname='os_payment_update' AND cmd='UPDATE'
      AND roles=ARRAY['authenticated']::name[]
      AND qual='(has_module_access(auth.uid(), ''hub_os''::text) AND (created_by = auth.uid()))'
      AND with_check='(has_module_access(auth.uid(), ''hub_os''::text) AND (created_by = auth.uid()))'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='os_payment_proof'
      AND policyname='os_payment_delete' AND cmd='DELETE'
      AND roles=ARRAY['authenticated']::name[]
      AND qual LIKE '%PAYMENT_SUBMITTED%' AND qual LIKE '%attachment_path IS NULL%'
  )
  THEN RAISE EXCEPTION '19T_ABORTED_PROOF_RLS_DRIFT'; END IF;

  IF has_table_privilege('authenticated','public.os_event','TRUNCATE')
    OR has_table_privilege('authenticated','public.os_payment_proof','TRUNCATE')
    OR has_table_privilege('authenticated','public.os_event','TRIGGER')
    OR has_table_privilege('authenticated','public.os_payment_proof','TRIGGER')
    OR NOT has_table_privilege('authenticated','public.os_event','SELECT')
  THEN RAISE EXCEPTION '19T_ABORTED_EVENT_RETENTION_DRIFT'; END IF;

  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
             WHERE name='phase_19t_legacy_payment_financial_immutability')
  THEN RAISE EXCEPTION '19T_ABORTED_ALREADY_APPLIED'; END IF;
END;
$preflight$;

-- Scope: replace only the existing SECURITY INVOKER function body.
CREATE OR REPLACE FUNCTION public.guard_legacy_payment_proof_mutations()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO ''
AS $guard$
BEGIN
  IF current_user = 'authenticated' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION '19S_AUTH_REQUIRED' USING ERRCODE='42501';
    END IF;

    IF TG_OP = 'INSERT' THEN
      -- Caller must create a genuinely pending, unattached payment record.
      IF NEW.status IS DISTINCT FROM 'PENDING'
        OR NEW.storage_provider IS DISTINCT FROM 'r2'
        OR NEW.attachment_path IS NOT NULL
        OR NEW.attachment_url IS NOT NULL
        OR NEW.storage_bucket IS NOT NULL
        OR NEW.r2_etag IS NOT NULL
        OR NEW.content_type IS NOT NULL
        OR NEW.size_bytes IS NOT NULL
        OR NEW.synced_to_smb_at IS NOT NULL
        OR NEW.smb_path IS NOT NULL
      THEN RAISE EXCEPTION '19T_PENDING_UPLOAD_REQUIRED' USING ERRCODE='42501'; END IF;

      NEW.created_by := auth.uid();
      NEW.created_at := now();
    ELSIF TG_OP = 'UPDATE' THEN
      IF OLD.created_by IS DISTINCT FROM auth.uid()
        OR NEW.id IS DISTINCT FROM OLD.id
        OR NEW.os_id IS DISTINCT FROM OLD.os_id
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
      THEN RAISE EXCEPTION '19S_PROOF_PROVENANCE_IMMUTABLE' USING ERRCODE='42501'; END IF;

      -- Once attached or submitted, authenticated clients cannot rewrite finance data.
      -- Event exists even for payments submitted without a file.
      IF OLD.status IS DISTINCT FROM 'PENDING'
        OR OLD.attachment_path IS NOT NULL
        OR OLD.attachment_url IS NOT NULL
        OR OLD.storage_bucket IS NOT NULL
        OR OLD.r2_etag IS NOT NULL
        OR OLD.content_type IS NOT NULL
        OR OLD.size_bytes IS NOT NULL
        OR OLD.synced_to_smb_at IS NOT NULL
        OR OLD.smb_path IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM public.os_event e
          WHERE e.os_id = OLD.os_id
            AND e.type = 'PAYMENT_SUBMITTED'
            AND e.payload->>'payment_id' = OLD.id::text
        )
      THEN RAISE EXCEPTION '19T_PROOF_FINALIZED_IMMUTABLE' USING ERRCODE='42501'; END IF;

      -- Only first upload metadata may be written by an authenticated owner.
      -- Finance values, original storage provider and status cannot change.
      IF NEW.status IS DISTINCT FROM OLD.status
        OR NEW.method IS DISTINCT FROM OLD.method
        OR NEW.amount IS DISTINCT FROM OLD.amount
        OR NEW.received_date IS DISTINCT FROM OLD.received_date
        OR NEW.installments IS DISTINCT FROM OLD.installments
        OR NEW.cadastro_completo IS DISTINCT FROM OLD.cadastro_completo
        OR NEW.storage_provider IS DISTINCT FROM OLD.storage_provider
      THEN RAISE EXCEPTION '19T_FINANCIAL_FIELDS_IMMUTABLE' USING ERRCODE='42501'; END IF;

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

DO $postcheck$
DECLARE
  v_source text;
BEGIN
  SELECT p.prosrc INTO v_source FROM pg_proc p
  WHERE p.oid='public.guard_legacy_payment_proof_mutations()'::regprocedure
    AND NOT p.prosecdef
    AND p.proconfig=ARRAY['search_path=""']::text[]
    AND pg_get_userbyid(p.proowner)='postgres'
    AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}'
    AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
    AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND has_function_privilege('service_role',p.oid,'EXECUTE');

  IF v_source IS NULL
    OR v_source NOT LIKE '%19T_PENDING_UPLOAD_REQUIRED%'
    OR v_source NOT LIKE '%19T_PROOF_FINALIZED_IMMUTABLE%'
    OR v_source NOT LIKE '%19T_FINANCIAL_FIELDS_IMMUTABLE%'
    OR v_source NOT LIKE '%19S_PROOF_PROVENANCE_IMMUTABLE%'
    OR v_source NOT LIKE '%19S_UPLOADED_PROOF_METADATA_IMMUTABLE%'
    OR v_source NOT LIKE '%PAYMENT_SUBMITTED%'
  THEN RAISE EXCEPTION '19T_ABORTED_GUARD_POSTCONDITION'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid='public.os_payment_proof'::regclass
      AND t.tgname='trg_guard_legacy_payment_proof_mutations'
      AND NOT t.tgisinternal AND t.tgenabled='O'
      AND t.tgfoid='public.guard_legacy_payment_proof_mutations()'::regprocedure
  ) THEN RAISE EXCEPTION '19T_ABORTED_TRIGGER_POSTCONDITION'; END IF;

  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public'
      AND tablename='os_payment_proof')<>4
    OR (SELECT count(*) FROM public.os_payment_proof)<>0
    OR has_table_privilege('authenticated','public.os_event','TRUNCATE')
    OR has_table_privilege('authenticated','public.os_payment_proof','TRUNCATE')
  THEN RAISE EXCEPTION '19T_ABORTED_RETAINED_19S_POSTCONDITION'; END IF;
END;
$postcheck$;
