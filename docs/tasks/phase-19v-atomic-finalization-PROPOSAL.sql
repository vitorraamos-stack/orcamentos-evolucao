-- EVOLUSYSTEM / PHASE 19V - REVIEW ONLY, NOT A MIGRATION.
-- DO NOT EXECUTE, MERGE AS A MIGRATION, OR APPLY IN PRODUCTION WITHOUT
-- NEW, EXPLICIT, SEPARATE APPROVAL AND TESTS.
-- This SQL is a design draft. Production preflight/rollback, direct-write
-- hardening, and authenticated integration tests are outstanding.

DO $preflight$
BEGIN
  IF to_regprocedure('public.finalize_legacy_payment_submission(uuid)') IS NOT NULL
  THEN RAISE EXCEPTION '19V_ABORTED_FUNCTION_EXISTS'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.guard_legacy_payment_proof_mutations()'::regprocedure
      AND md5(p.prosrc) = '8af26088723a9b4fb8dfb8863108affc'
      AND NOT p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']::text[]
  ) THEN RAISE EXCEPTION '19V_ABORTED_19T_GUARD_DRIFT'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.os_event e
    WHERE e.type = 'PAYMENT_SUBMITTED'
      AND e.payload->>'payment_id' IS NOT NULL
    GROUP BY e.os_id, e.payload->>'payment_id'
    HAVING count(*) > 1
  ) THEN RAISE EXCEPTION '19V_ABORTED_DUPLICATED_SUBMISSIONS'; END IF;
END;
$preflight$;

-- Idempotency across HTTP retries/devices. Does not by itself prevent
-- forged submissions through the existing general os_event INSERT policy.
CREATE UNIQUE INDEX os_event_payment_submission_once
  ON public.os_event (os_id, (payload->>'payment_id'))
  WHERE type = 'PAYMENT_SUBMITTED' AND payload->>'payment_id' IS NOT NULL;

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
  v_existing_payload jsonb;
  v_new_status text;
BEGIN
  IF current_user <> 'authenticated' OR v_actor IS NULL
  THEN RAISE EXCEPTION '19V_AUTH_REQUIRED' USING ERRCODE='42501'; END IF;

  IF p_proof_id IS NULL OR NOT public.has_module_access(v_actor, 'hub_os')
  THEN RAISE EXCEPTION '19V_MODULE_ACCESS_REQUIRED' USING ERRCODE='42501'; END IF;

  -- Discover only own proof under RLS, then lock OS before locking the proof.
  SELECT p.os_id INTO v_os_id
  FROM public.os_payment_proof AS p
  WHERE p.id = p_proof_id AND p.created_by = v_actor;

  IF v_os_id IS NULL
  THEN RAISE EXCEPTION '19V_PROOF_NOT_OWNED' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_order FROM public.os AS o WHERE o.id = v_os_id FOR UPDATE;
  IF NOT FOUND
  THEN RAISE EXCEPTION '19V_OS_NOT_FOUND' USING ERRCODE='P0002'; END IF;

  SELECT * INTO v_proof
  FROM public.os_payment_proof AS p
  WHERE p.id = p_proof_id AND p.os_id = v_order.id AND p.created_by = v_actor
  FOR UPDATE;
  IF NOT FOUND
  THEN RAISE EXCEPTION '19V_PROOF_CHANGED' USING ERRCODE='42501'; END IF;

  -- The OS lock serializes concurrent submissions against the same OS.
  SELECT e.payload INTO v_existing_payload
  FROM public.os_event AS e
  WHERE e.os_id = v_order.id
    AND e.type = 'PAYMENT_SUBMITTED'
    AND e.payload->>'payment_id' = p_proof_id::text
  LIMIT 1;

  IF v_existing_payload IS NOT NULL THEN
    IF v_existing_payload->>'status' NOT IN ('PENDING','UNDER_REVIEW','RELEASED','BLOCKED','SCHEDULED')
    THEN RAISE EXCEPTION '19V_CORRUPTED_EXISTING_EVENT'; END IF;
    RETURN jsonb_build_object(
      'payment_id', p_proof_id,
      'payment_status', v_existing_payload->>'status',
      'already_submitted', true
    );
  END IF;

  IF v_proof.status <> 'PENDING' OR v_proof.storage_provider <> 'r2'
  THEN RAISE EXCEPTION '19V_PROOF_NOT_READY' USING ERRCODE='23514'; END IF;

  -- An empty proof is allowed. If there is an attachment, require minimum
  -- completed metadata; never use an unverified R2 key from client arguments.
  IF v_proof.attachment_path IS NOT NULL AND (
     v_proof.attachment_path NOT LIKE ('os_orders/' || v_order.id::text || '/payment_proofs/' || v_proof.id::text || '/%')
     OR v_proof.content_type IS NULL
     OR v_proof.size_bytes IS NULL
     OR v_proof.size_bytes <= 0
  ) THEN RAISE EXCEPTION '19V_INCOMPLETE_ATTACHMENT' USING ERRCODE='23514'; END IF;

  IF v_proof.attachment_path IS NULL AND (
     v_proof.attachment_url IS NOT NULL OR v_proof.storage_bucket IS NOT NULL
     OR v_proof.r2_etag IS NOT NULL OR v_proof.content_type IS NOT NULL
     OR v_proof.size_bytes IS NOT NULL OR v_proof.synced_to_smb_at IS NOT NULL
     OR v_proof.smb_path IS NOT NULL
  ) THEN RAISE EXCEPTION '19V_PARTIAL_ATTACHMENT_METADATA' USING ERRCODE='23514'; END IF;

  -- Mirror existing client rule using server-side America/Sao_Paulo calendar.
  v_new_status := CASE
    WHEN v_proof.method = 'AGENDADO' THEN 'SCHEDULED'
    WHEN v_order.quote_total IS NOT NULL
      AND v_order.quote_total > 0
      AND v_proof.amount >= v_order.quote_total
      AND v_proof.received_date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
      THEN 'RELEASED'
    ELSE 'UNDER_REVIEW'
  END;

  UPDATE public.os AS o
  SET payment_status = v_new_status, updated_at = now()
  WHERE o.id = v_order.id;
  IF NOT FOUND
  THEN RAISE EXCEPTION '19V_OS_UPDATE_FAILED' USING ERRCODE='42501'; END IF;

  INSERT INTO public.os_event (os_id, type, payload, created_by)
  VALUES (
    v_order.id,
    'PAYMENT_SUBMITTED',
    jsonb_build_object('payment_id', p_proof_id, 'status', v_new_status),
    v_actor
  );
  -- The transaction aborts BOTH writes if this INSERT fails.

  RETURN jsonb_build_object(
    'payment_id', p_proof_id,
    'payment_status', v_new_status,
    'already_submitted', false
  );
END;
$finalize$;

REVOKE ALL ON FUNCTION public.finalize_legacy_payment_submission(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_legacy_payment_submission(uuid)
  TO authenticated;

-- STOP: THIS FILE IS A PROPOSAL. NO CLAIM OF SQL COMPILATION, RLS OR E2E TESTING.
