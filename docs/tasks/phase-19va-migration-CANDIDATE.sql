-- EvoluSystem 19V-A: additive financial finalization — CANDIDATE, NOT APPLIED.
-- A separate explicit authorization, Supabase CLI migration generation and
-- production drift review are mandatory before this SQL is ever executed.
-- Do not place this draft under supabase/migrations automatically.
--
-- The new RPC and partial index are additive. The legacy UI remains unchanged.
-- Existing direct financial UPDATE/INSERT/DELETE remain possible until 19V-C.
-- Real authorization, concurrency and rollback behavior is NOT homologated.

-- Required production checks, fail closed BEFORE DDL.
DO $preflight$
BEGIN
  IF to_regprocedure('public.finalize_legacy_payment_submission(uuid)') IS NOT NULL
    OR to_regclass('public.os_event_payment_submission_once') IS NOT NULL
  THEN RAISE EXCEPTION '19VA_ABORT_EXISTING_OBJECT' USING ERRCODE='55000'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    WHERE c.oid='public.os'::regclass AND c.relkind='r' AND c.relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    WHERE c.oid='public.os_event'::regclass AND c.relkind='r' AND c.relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    WHERE c.oid='public.os_payment_proof'::regclass
      AND c.relkind='r' AND c.relrowsecurity
  ) THEN RAISE EXCEPTION '19VA_ABORT_TABLE_RLS_DRIFT' USING ERRCODE='55000'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid = 'public.guard_legacy_payment_proof_mutations()'::regprocedure
      AND md5(p.prosrc)='8af26088723a9b4fb8dfb8863108affc'
      AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[]
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid='public.os_payment_proof'::regclass
      AND t.tgname='trg_guard_legacy_payment_proof_mutations'
      AND t.tgfoid='public.guard_legacy_payment_proof_mutations()'::regprocedure
      AND t.tgenabled='O' AND t.tgtype=23
  ) THEN RAISE EXCEPTION '19VA_ABORT_19T_DRIFT' USING ERRCODE='55000'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies p
    WHERE p.schemaname='public' AND p.tablename='os'
      AND p.policyname='os_update' AND p.cmd='UPDATE'
      AND p.roles=ARRAY['authenticated']::name[]
      AND p.qual='has_module_access(auth.uid(), ''hub_os''::text)'
      AND p.with_check='has_module_access(auth.uid(), ''hub_os''::text)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies p
    WHERE p.schemaname='public' AND p.tablename='os_event'
      AND p.policyname='os_event_insert' AND p.cmd='INSERT'
      AND p.roles=ARRAY['authenticated']::name[]
      AND p.with_check='has_module_access(auth.uid(), ''hub_os''::text)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies p
    WHERE p.schemaname='public' AND p.tablename='os_event'
      AND p.policyname='os_event_read' AND p.cmd='SELECT'
      AND p.roles=ARRAY['authenticated']::name[]
      AND p.qual='has_module_access(auth.uid(), ''hub_os''::text)'
  ) THEN RAISE EXCEPTION '19VA_ABORT_RLS_DRIFT' USING ERRCODE='55000'; END IF;

  IF NOT (
    pg_catalog.has_table_privilege('authenticated','public.os','SELECT')
    AND pg_catalog.has_table_privilege('authenticated','public.os','UPDATE')
    AND pg_catalog.has_table_privilege('authenticated','public.os_event','SELECT')
    AND pg_catalog.has_table_privilege('authenticated','public.os_event','INSERT')
    AND pg_catalog.has_table_privilege('authenticated','public.os_payment_proof','SELECT')
  ) THEN RAISE EXCEPTION '19VA_ABORT_GRANTS_DRIFT' USING ERRCODE='55000'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.os_event e
    LEFT JOIN public.os_payment_proof p
      ON (e.payload->>'payment_id')=p.id::text
    WHERE e.type='PAYMENT_SUBMITTED'
      AND (
        e.payload->>'payment_id' IS NULL
        OR e.payload->>'payment_id' !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR e.payload->>'status' IS NULL
        OR e.payload->>'status' NOT IN
          ('PENDING','UNDER_REVIEW','RELEASED','BLOCKED','SCHEDULED')
        OR p.id IS NULL OR p.os_id IS DISTINCT FROM e.os_id
      )
  ) THEN RAISE EXCEPTION '19VA_ABORT_INVALID_LEGACY_EVENT' USING ERRCODE='55000'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.os_event e
    WHERE e.type='PAYMENT_SUBMITTED'
    GROUP BY e.os_id,e.payload->>'payment_id'
    HAVING count(*)>1
  ) THEN RAISE EXCEPTION '19VA_ABORT_DUPLICATE_SUBMISSIONS' USING ERRCODE='55000'; END IF;
END;
$preflight$;

-- Allows exactly one PAYMENT_SUBMITTED per OS and payment proof.
-- No operational status event is affected.
CREATE UNIQUE INDEX os_event_payment_submission_once
  ON public.os_event (os_id, (payload->>'payment_id'))
  WHERE type='PAYMENT_SUBMITTED'
    AND payload->>'payment_id' IS NOT NULL;

-- PostgreSQL executes both DML commands atomically in the same RPC call.
-- A failed INSERT raises an error and the preceding UPDATE rolls back.
CREATE FUNCTION public.finalize_legacy_payment_submission(p_proof_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $finalize$
DECLARE
  v_actor uuid := auth.uid();
  v_os_id uuid;
  v_order public.os%ROWTYPE;
  v_proof public.os_payment_proof%ROWTYPE;
  v_existing_event_id uuid;
  v_existing_event_owner uuid;
  v_existing_event_payload jsonb;
  v_status text;
BEGIN
  IF current_user <> 'authenticated' OR v_actor IS NULL
  THEN RAISE EXCEPTION '19VA_AUTH_REQUIRED' USING ERRCODE='42501'; END IF;

  IF p_proof_id IS NULL OR NOT public.has_module_access(v_actor,'hub_os')
  THEN RAISE EXCEPTION '19VA_MODULE_REQUIRED' USING ERRCODE='42501'; END IF;

  -- Discover under RLS, then lock OS first, proof second to serialize RPCs.
  SELECT p.os_id INTO v_os_id
  FROM public.os_payment_proof p
  WHERE p.id=p_proof_id AND p.created_by=v_actor;
  IF v_os_id IS NULL
  THEN RAISE EXCEPTION '19VA_PROOF_NOT_OWNED' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_order
  FROM public.os o
  WHERE o.id=v_os_id
  FOR UPDATE;
  IF NOT FOUND
  THEN RAISE EXCEPTION '19VA_ORDER_NOT_FOUND' USING ERRCODE='P0002'; END IF;

  SELECT * INTO v_proof
  FROM public.os_payment_proof p
  WHERE p.id=p_proof_id AND p.os_id=v_order.id AND p.created_by=v_actor
  FOR UPDATE;
  IF NOT FOUND
  THEN RAISE EXCEPTION '19VA_PROOF_CHANGED' USING ERRCODE='42501'; END IF;

  -- If the first response was lost, do not change OS or insert a second event.
  SELECT e.id,e.created_by,e.payload
  INTO v_existing_event_id,v_existing_event_owner,v_existing_event_payload
  FROM public.os_event e
  WHERE e.os_id=v_order.id AND e.type='PAYMENT_SUBMITTED'
    AND e.payload->>'payment_id'=p_proof_id::text
  LIMIT 1;

  IF v_existing_event_id IS NOT NULL THEN
    IF v_existing_event_owner IS DISTINCT FROM v_actor
      OR v_existing_event_payload->>'status' IS NULL
      OR v_existing_event_payload->>'status' NOT IN
        ('PENDING','UNDER_REVIEW','RELEASED','BLOCKED','SCHEDULED')
    THEN RAISE EXCEPTION '19VA_EVENT_PROVENANCE_INVALID' USING ERRCODE='42501'; END IF;

    RETURN pg_catalog.jsonb_build_object(
      'payment_id',p_proof_id,
      'payment_status',v_existing_event_payload->>'status',
      'current_os_payment_status',v_order.payment_status,
      'already_submitted',true
    );
  END IF;

  IF v_proof.status IS DISTINCT FROM 'PENDING'
    OR v_proof.storage_provider IS DISTINCT FROM 'r2'
    OR v_proof.amount IS NULL OR v_proof.amount<=0
    OR v_proof.method IS NULL
    OR v_proof.method NOT IN ('PIX','CARTAO','AGENDADO','OUTRO')
  THEN RAISE EXCEPTION '19VA_FINANCIAL_VALUES_INVALID' USING ERRCODE='23514'; END IF;

  -- A submission can have no attachment. If it has an R2 attachment,
  -- require persisted metadata, but note the DB cannot attest R2 existence.
  IF v_proof.attachment_path IS NOT NULL AND (
     v_proof.attachment_path NOT LIKE
       ('os_orders/'||v_order.id::text||'/payment_proofs/'||v_proof.id::text||'/%')
     OR v_proof.attachment_url IS NOT NULL
     OR v_proof.content_type IS NULL
     OR v_proof.size_bytes IS NULL OR v_proof.size_bytes<=0
  ) THEN RAISE EXCEPTION '19VA_ATTACHMENT_INCOMPLETE' USING ERRCODE='23514'; END IF;

  IF v_proof.attachment_path IS NULL AND (
     v_proof.attachment_url IS NOT NULL
     OR v_proof.storage_bucket IS NOT NULL
     OR v_proof.r2_etag IS NOT NULL
     OR v_proof.content_type IS NOT NULL
     OR v_proof.size_bytes IS NOT NULL
     OR v_proof.synced_to_smb_at IS NOT NULL
     OR v_proof.smb_path IS NOT NULL
  ) THEN RAISE EXCEPTION '19VA_ATTACHMENT_PARTIAL' USING ERRCODE='23514'; END IF;

  v_status:=CASE
    WHEN v_proof.method='AGENDADO' THEN 'SCHEDULED'
    WHEN v_order.quote_total IS NOT NULL AND v_order.quote_total>0
      AND v_proof.amount>=v_order.quote_total
      AND v_proof.received_date=
        (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date
      THEN 'RELEASED'
    ELSE 'UNDER_REVIEW'
  END;

  UPDATE public.os o
  SET payment_status=v_status,updated_at=pg_catalog.now()
  WHERE o.id=v_order.id;
  IF NOT FOUND
  THEN RAISE EXCEPTION '19VA_OS_UPDATE_FAILED' USING ERRCODE='42501'; END IF;

  INSERT INTO public.os_event(os_id,type,payload,created_by)
  VALUES (
    v_order.id,'PAYMENT_SUBMITTED',
    pg_catalog.jsonb_build_object('payment_id',p_proof_id,'status',v_status),
    v_actor
  );

  RETURN pg_catalog.jsonb_build_object(
    'payment_id',p_proof_id,
    'payment_status',v_status,
    'current_os_payment_status',v_status,
    'already_submitted',false
  );
END;
$finalize$;

-- Revoke implicit PUBLIC EXECUTE before granting the minimum role.
REVOKE ALL ON FUNCTION public.finalize_legacy_payment_submission(uuid)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.finalize_legacy_payment_submission(uuid)
  TO authenticated;

DO $postcheck$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid='public.finalize_legacy_payment_submission(uuid)'::regprocedure
      AND NOT p.prosecdef
      AND p.proconfig=ARRAY['search_path=""']::text[]
  ) OR NOT pg_catalog.has_function_privilege(
    'authenticated','public.finalize_legacy_payment_submission(uuid)','EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'anon','public.finalize_legacy_payment_submission(uuid)','EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'service_role','public.finalize_legacy_payment_submission(uuid)','EXECUTE'
  ) OR to_regclass('public.os_event_payment_submission_once') IS NULL
  THEN RAISE EXCEPTION '19VA_POSTCHECK_FAILED' USING ERRCODE='55000'; END IF;
END;
$postcheck$;

-- End of 19V-A CANDIDATE. Frontend and finance write policy unchanged.
