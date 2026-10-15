-- EvoluSystem phase 19V-C — DESIGN CANDIDATE, NOT APPLIED.
-- This is an intentionally non-deployable, review-only source file.
-- Do NOT execute on Supabase or copy under supabase/migrations until a
-- dedicated, separately authorized migration has been reviewed.
-- No production changes are performed by this file in the PR.

-- Intent: remove general finance UPDATE privileges but preserve operational
-- columns; protect PAYMENT_SUBMITTED against direct CRUD, and preserve the
-- existing 19V-B client RPC signature with a trusted internal implementation.
--
-- SECURITY MODEL: Invoker public wrapper -> privileged private helper.
-- The helper must be in a non-exposed schema, run with fixed search_path,
-- validate auth.uid(), module access, proof ownership and state manually.
-- Privileged service_role/postgres remains a separate trusted integration
-- surface. Do not treat its writes as blocked by these client protections.

DO $preflight$
BEGIN
  IF to_regnamespace('evolusystem_finance_private') IS NOT NULL
    OR to_regprocedure('public.guard_legacy_financial_event_writes()') IS NOT NULL
    OR to_regprocedure('public.guard_legacy_paid_os_deletion()') IS NOT NULL
    OR to_regprocedure('public.guard_legacy_os_financial_insert()') IS NOT NULL
  THEN RAISE EXCEPTION '19VC_OBJECT_COLLISION' USING ERRCODE='55000'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20261015134750'
  ) THEN RAISE EXCEPTION '19VC_MISSING_19VA' USING ERRCODE='55000'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid='public.finalize_legacy_payment_submission(uuid)'::regprocedure
      AND NOT p.prosecdef
      AND md5(p.prosrc)='cc781eed0a4c590edb7facc4c9a731fd'
      AND p.proconfig=ARRAY['search_path=""']::text[]
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid='public.guard_legacy_payment_proof_mutations()'::regprocedure
      AND NOT p.prosecdef
      AND md5(p.prosrc)='8af26088723a9b4fb8dfb8863108affc'
  ) THEN RAISE EXCEPTION '19VC_FINANCE_FUNCTION_DRIFT' USING ERRCODE='55000'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    WHERE c.oid='public.os'::regclass AND c.relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    WHERE c.oid='public.os_event'::regclass AND c.relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    WHERE c.oid='public.os_payment_proof'::regclass AND c.relrowsecurity
  ) THEN RAISE EXCEPTION '19VC_RLS_DRIFT' USING ERRCODE='55000'; END IF;

  IF NOT pg_catalog.has_table_privilege('authenticated','public.os','UPDATE')
    OR NOT pg_catalog.has_table_privilege('authenticated','public.os_event','INSERT')
    OR NOT pg_catalog.has_table_privilege('authenticated','public.os_event','DELETE')
  THEN RAISE EXCEPTION '19VC_PRIVILEGE_DRIFT' USING ERRCODE='55000'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid IN ('public.os'::regclass,'public.os_event'::regclass)
      AND NOT t.tgisinternal
  ) THEN RAISE EXCEPTION '19VC_TRIGGER_COLLISION' USING ERRCODE='55000'; END IF;

  -- Parent deletion cascades to payment proofs AND events. Ensure both FKs
  -- have their expected behavior before relying on parent-row protection.
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conname='os_event_os_id_fkey'
      AND c.conrelid='public.os_event'::regclass
      AND c.confrelid='public.os'::regclass
      AND c.contype='f' AND c.confdeltype='c'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conname='os_payment_proof_os_id_fkey'
      AND c.conrelid='public.os_payment_proof'::regclass
      AND c.confrelid='public.os'::regclass
      AND c.contype='f' AND c.confdeltype='c'
  ) THEN RAISE EXCEPTION '19VC_PARENT_CASCADE_DRIFT' USING ERRCODE='55000'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.os_event e
    WHERE e.type='PAYMENT_SUBMITTED'
      AND (e.payload->>'payment_id' IS NULL
        OR e.payload->>'payment_id' !~*
            '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  ) THEN RAISE EXCEPTION '19VC_INVALID_FINANCE_HISTORY' USING ERRCODE='55000'; END IF;
END;
$preflight$;

-- Non-PostgREST-exposed schema. Must not be added to API exposed schemas.
CREATE SCHEMA evolusystem_finance_private;
REVOKE ALL ON SCHEMA evolusystem_finance_private FROM PUBLIC,anon,service_role;
GRANT USAGE ON SCHEMA evolusystem_finance_private TO authenticated;

-- Deliberately privileged narrow implementation for a single receipt ID.
-- This copies the verified 19V-A behavior, preserving lock order and return
-- contract. Only current_user check changes because definer executes as owner.
CREATE FUNCTION evolusystem_finance_private.finalize_legacy_payment_submission(p_proof_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
  IF v_actor IS NULL
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

REVOKE ALL ON FUNCTION
  evolusystem_finance_private.finalize_legacy_payment_submission(uuid)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION
  evolusystem_finance_private.finalize_legacy_payment_submission(uuid)
  TO authenticated;

-- Existing public signature must stay compatible with the 19V-B frontend.
-- It is SECURITY INVOKER and checks the original caller BEFORE delegation.
CREATE OR REPLACE FUNCTION public.finalize_legacy_payment_submission(p_proof_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $wrapper$
BEGIN
  IF current_user <> 'authenticated' OR auth.uid() IS NULL
  THEN RAISE EXCEPTION '19VC_AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_proof_id IS NULL OR NOT public.has_module_access(auth.uid(),'hub_os')
  THEN RAISE EXCEPTION '19VC_MODULE_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN evolusystem_finance_private.finalize_legacy_payment_submission(p_proof_id);
END;
$wrapper$;

REVOKE ALL ON FUNCTION public.finalize_legacy_payment_submission(uuid)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.finalize_legacy_payment_submission(uuid)
  TO authenticated;

-- Prevent direct financial event tampering, while leaving non-financial
-- status/comment/production events for existing INSERT/DELETE RLS policies.
-- The private helper runs as postgres and may create its verified event.
CREATE FUNCTION public.guard_legacy_financial_event_writes()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $eventguard$
BEGIN
  IF current_user NOT IN ('postgres','service_role') THEN
    IF TG_OP='INSERT' THEN
      IF NEW.type='PAYMENT_SUBMITTED' THEN
        RAISE EXCEPTION '19VC_DIRECT_FINANCIAL_EVENT_INSERT_BLOCKED'
          USING ERRCODE='42501';
      END IF;
    ELSIF TG_OP='UPDATE' THEN
      IF OLD.type='PAYMENT_SUBMITTED' OR NEW.type='PAYMENT_SUBMITTED' THEN
        RAISE EXCEPTION '19VC_DIRECT_FINANCIAL_EVENT_UPDATE_BLOCKED'
          USING ERRCODE='42501';
      END IF;
    ELSIF TG_OP='DELETE' THEN
      IF OLD.type='PAYMENT_SUBMITTED' THEN
        RAISE EXCEPTION '19VC_DIRECT_FINANCIAL_EVENT_DELETE_BLOCKED'
          USING ERRCODE='42501';
      END IF;
    END IF;
  END IF;

  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$eventguard$;

CREATE TRIGGER trg_guard_legacy_financial_event_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.os_event
  FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_financial_event_writes();

-- For authenticated clients, OS must start with pending financial status
-- AND without client-supplied quote_id/quote_total. Trusted quote handoff
-- is on the separate os_orders path; integration compatibility must still
-- be reviewed before deployment (especially third-party legacy writers).
CREATE FUNCTION public.guard_legacy_os_financial_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $osinsert$
BEGIN
  IF current_user NOT IN ('postgres','service_role')
    AND (
      NEW.payment_status IS DISTINCT FROM 'PENDING'
      OR NEW.quote_total IS NOT NULL
      OR NEW.quote_id IS NOT NULL
    )
  THEN RAISE EXCEPTION '19VC_DIRECT_FINANCIAL_OS_INSERT_BLOCKED'
    USING ERRCODE='42501'; END IF;
  RETURN NEW;
END;
$osinsert$;

CREATE TRIGGER trg_guard_legacy_os_financial_insert
  BEFORE INSERT ON public.os
  FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_os_financial_insert();

-- An OS deletion cascades payment events/proofs via FK. Blocking only
-- PAYMENT_SUBMITTED events would still let users erase pending or attached
-- proofs with no submission event. Preserve ALL payment artifacts.
CREATE FUNCTION public.guard_legacy_paid_os_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $osdelete$
BEGIN
  IF current_user NOT IN ('postgres','service_role')
    AND (
      EXISTS (
        SELECT 1 FROM public.os_event e
        WHERE e.os_id=OLD.id AND e.type='PAYMENT_SUBMITTED'
      )
      OR EXISTS (
        SELECT 1 FROM public.os_payment_proof p
        WHERE p.os_id=OLD.id
      )
    )
  THEN RAISE EXCEPTION '19VC_OS_WITH_FINANCIAL_ARTIFACT_DELETE_BLOCKED'
    USING ERRCODE='42501'; END IF;
  RETURN OLD;
END;
$osdelete$;

CREATE TRIGGER trg_guard_legacy_paid_os_deletion
  BEFORE DELETE ON public.os
  FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_paid_os_deletion();

-- Restrict direct UPDATE of status AND financial quote reference.
-- A table-level UPDATE grant overrides any column-level restriction.
REVOKE UPDATE ON public.os FROM authenticated,anon;

-- Operational fields retain UPDATE; financial and OS-identity fields excluded.
GRANT UPDATE (customer_name, customer_phone, title, description, folder_path, status_id, assigned_to, updated_at, sale_number, client_name, delivery_date, delivery_type, shipping_carrier, tracking_code, address, notes, installation_date, installation_time_window, on_site_contact, status_arte, status_producao, is_reproducao, repro_motivo, has_letra_caixa, is_producao_externa) ON public.os TO authenticated;

-- RLS does NOT guard TRUNCATE, TRIGGER or REFERENCES table privileges.
-- Existing grants on legacy OS are too broad for browser-facing roles.
-- Clients must not erase entire tables or introduce their own triggers/FKs.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.os
  FROM authenticated,anon;
REVOKE TRIGGER, REFERENCES ON public.os_event,public.os_payment_proof
  FROM authenticated,anon;

-- No need to permit invoking trigger functions as standalone RPCs.
REVOKE ALL ON FUNCTION public.guard_legacy_financial_event_writes()
  FROM PUBLIC,authenticated,anon,service_role;
REVOKE ALL ON FUNCTION public.guard_legacy_paid_os_deletion()
  FROM PUBLIC,authenticated,anon,service_role;
REVOKE ALL ON FUNCTION public.guard_legacy_os_financial_insert()
  FROM PUBLIC,authenticated,anon,service_role;

DO $postcheck$
BEGIN
  IF pg_catalog.has_table_privilege('authenticated','public.os','UPDATE')
    OR pg_catalog.has_table_privilege('anon','public.os','UPDATE')
    OR pg_catalog.has_table_privilege('authenticated','public.os','TRUNCATE')
    OR pg_catalog.has_table_privilege('anon','public.os','TRUNCATE')
    OR pg_catalog.has_table_privilege('authenticated','public.os','TRIGGER')
    OR pg_catalog.has_table_privilege('anon','public.os','TRIGGER')
    OR pg_catalog.has_table_privilege('authenticated','public.os','REFERENCES')
    OR pg_catalog.has_table_privilege('anon','public.os','REFERENCES')
    OR pg_catalog.has_column_privilege('anon','public.os','payment_status','UPDATE')
    OR pg_catalog.has_column_privilege('authenticated','public.os','payment_status','UPDATE')
    OR pg_catalog.has_column_privilege('authenticated','public.os','quote_total','UPDATE')
    OR pg_catalog.has_column_privilege('authenticated','public.os','quote_id','UPDATE')
    OR pg_catalog.has_column_privilege('authenticated','public.os','created_by','UPDATE')
    OR pg_catalog.has_column_privilege('authenticated','public.os','os_number','UPDATE')
    OR NOT pg_catalog.has_column_privilege('authenticated','public.os','status_arte','UPDATE')
    OR NOT pg_catalog.has_column_privilege('authenticated','public.os','status_producao','UPDATE')
    OR NOT pg_catalog.has_column_privilege('authenticated','public.os','status_id','UPDATE')
    OR NOT pg_catalog.has_column_privilege('authenticated','public.os','updated_at','UPDATE')
    OR pg_catalog.has_table_privilege('authenticated','public.os_event','TRIGGER')
    OR pg_catalog.has_table_privilege('anon','public.os_event','TRIGGER')
    OR pg_catalog.has_table_privilege('authenticated','public.os_payment_proof','TRIGGER')
    OR pg_catalog.has_table_privilege('anon','public.os_payment_proof','TRIGGER')
    OR NOT pg_catalog.has_function_privilege(
        'authenticated','public.finalize_legacy_payment_submission(uuid)','EXECUTE')
    OR pg_catalog.has_function_privilege(
        'anon','public.finalize_legacy_payment_submission(uuid)','EXECUTE')
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
      WHERE p.oid='evolusystem_finance_private.finalize_legacy_payment_submission(uuid)'::regprocedure
        AND p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[]
    )
  THEN RAISE EXCEPTION '19VC_POSTCHECK_FAILED' USING ERRCODE='55000'; END IF;

  IF (SELECT count(*) FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid='public.os_event'::regclass
        AND t.tgname='trg_guard_legacy_financial_event_writes'
        AND t.tgenabled='O'
     )<>1
     OR (SELECT count(*) FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid='public.os'::regclass
        AND t.tgname IN (
          'trg_guard_legacy_os_financial_insert',
          'trg_guard_legacy_paid_os_deletion'
        ) AND t.tgenabled='O'
     )<>2
  THEN RAISE EXCEPTION '19VC_TRIGGER_POSTCHECK_FAILED'
    USING ERRCODE='55000'; END IF;
END;
$postcheck$;

-- END OF REVIEW CANDIDATE — DO NOT EXECUTE WITHOUT SEPARATE AUTHORIZATION.
