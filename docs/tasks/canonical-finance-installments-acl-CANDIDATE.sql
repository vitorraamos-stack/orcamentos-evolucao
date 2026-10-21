-- EvoluSystem — Canonical finance installments privileges.
-- REVIEW CANDIDATE; NOT APPLIED. No Supabase migration is created here.
-- Applies to public.os_finance_installments only, NOT legacy public.os.
--
-- Intention:
-- * protect structural installment columns against direct client writes;
-- * preserve authenticated SELECT and update of the four fields used
--   by the existing Financeiro/Pendentes UI, subject to existing RLS;
-- * preserve service_role and postgres owner grants completely;
-- * retain finance_upsert_from_asset SECURITY DEFINER workflow.
-- DEPENDENCY BLOCK: do not apply until direct authenticated DELETE on
-- os_orders is closed, and finance_upsert_from_asset no longer resets
-- reconciled installments on repeated uploads. Follow-up DDL must be
-- separately reviewed; current candidate intentionally fails preflight.
-- IMPORTANT: This is not an end-to-end security certification.
-- The four editable columns still require a future transition to
-- a server-side reviewer-bound RPC for full attribution assurance.

DO $preflight$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'CANONICAL_FINANCE_WRONG_EXECUTOR' USING ERRCODE='42501';
  END IF;

  -- A direct DELETE on the parent bypasses the safe deletion RPC and
  -- cascades to installments/assets. This must be fixed before rollout.
  IF has_table_privilege('authenticated','public.os_orders','DELETE')
    OR has_table_privilege('anon','public.os_orders','DELETE')
  THEN
    RAISE EXCEPTION 'CANONICAL_FINANCE_ORDER_DIRECT_DELETE_BYPASS_UNRESOLVED'
      USING ERRCODE='55000';
  END IF;

  -- Existing privileged receipt RPC resets reconciled statuses and
  -- rewrites proof links on conflict. This is a prerequisite block,
  -- not a rewrite of financial history. After remediation, re-audit
  -- and update the approved SQL hash and compatibility checks.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.finance_upsert_from_asset(uuid,uuid,text,date)'::regprocedure
      AND md5(p.prosrc)='9bc1567dad2ab1640a82bf9893fc8ef3'
  ) THEN
    RAISE EXCEPTION 'CANONICAL_FINANCE_UPSERT_RECONCILIATION_RESET_UNRESOLVED'
      USING ERRCODE='55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid='public.os_finance_installments'::regclass
      AND c.relkind='r'
      AND c.relrowsecurity
      AND pg_get_userbyid(c.relowner)='postgres'
  ) THEN
    RAISE EXCEPTION 'CANONICAL_FINANCE_TABLE_RLS_OWNER_DRIFT' USING ERRCODE='55000';
  END IF;

  -- The ordinary finance reviewers currently have a broad table UPDATE
  -- and the RLS condition below. Do not narrow grants under another policy.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname='public'
      AND p.tablename='os_finance_installments'
      AND p.policyname='os_finance_installments_update_financeiro'
      AND p.cmd='UPDATE'
      AND p.roles=ARRAY['authenticated']::name[]
      AND p.qual='has_module_access(auth.uid(), ''hub_os_financeiro''::text)'
      AND p.with_check='has_module_access(auth.uid(), ''hub_os_financeiro''::text)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname='public'
      AND p.tablename='os_finance_installments'
      AND p.policyname='os_finance_installments_insert'
      AND p.cmd='INSERT'
      AND p.roles=ARRAY['authenticated']::name[]
      AND p.with_check='has_module_access(auth.uid(), ''hub_os''::text)'
  ) THEN
    RAISE EXCEPTION 'CANONICAL_FINANCE_POLICIES_DRIFT' USING ERRCODE='55000';
  END IF;

  IF NOT (
    pg_has_role('authenticated','service_role','MEMBER')=false
    AND has_table_privilege('authenticated','public.os_finance_installments','SELECT')
    AND has_table_privilege('authenticated','public.os_finance_installments','INSERT')
    AND has_table_privilege('authenticated','public.os_finance_installments','UPDATE')
    AND has_table_privilege('authenticated','public.os_finance_installments','DELETE')
    AND has_table_privilege('authenticated','public.os_finance_installments','MAINTAIN')
    AND has_table_privilege('service_role','public.os_finance_installments','INSERT')
    AND has_table_privilege('service_role','public.os_finance_installments','UPDATE')
    AND has_table_privilege('service_role','public.os_finance_installments','DELETE')
  ) THEN
    RAISE EXCEPTION 'CANONICAL_FINANCE_ACL_BASELINE_DRIFT' USING ERRCODE='55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.finance_upsert_from_asset(uuid,uuid,text,date)'::regprocedure
      AND p.prosecdef
      AND pg_get_userbyid(p.proowner)='postgres'
      AND md5(p.prosrc)='9bc1567dad2ab1640a82bf9893fc8ef3'
  ) OR NOT has_function_privilege(
      'authenticated',
      'public.finance_upsert_from_asset(uuid,uuid,text,date)',
      'EXECUTE'
  ) OR has_function_privilege(
      'anon',
      'public.finance_upsert_from_asset(uuid,uuid,text,date)',
      'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'CANONICAL_FINANCE_UPSERT_RPC_DRIFT' USING ERRCODE='55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_proc f ON f.oid=t.tgfoid
    WHERE t.tgrelid='public.os_finance_installments'::regclass
      AND t.tgname='trg_os_finance_installment_audit'
      AND t.tgenabled='O'
      AND NOT t.tgisinternal
      AND f.oid='public.os_finance_installment_audit_trigger()'::regprocedure
      AND md5(f.prosrc)='df7e652e9ec347cdd3583209e9b0d44f'
  ) OR (SELECT count(*) FROM pg_trigger
    WHERE tgrelid='public.os_finance_installments'::regclass AND NOT tgisinternal)<>1
  THEN
    RAISE EXCEPTION 'CANONICAL_FINANCE_AUDIT_TRIGGER_DRIFT' USING ERRCODE='55000';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_attribute a
    WHERE a.attrelid='public.os_finance_installments'::regclass
      AND a.attnum>0 AND NOT a.attisdropped
  )<>12 THEN
    RAISE EXCEPTION 'CANONICAL_FINANCE_COLUMNS_DRIFT' USING ERRCODE='55000';
  END IF;
END;
$preflight$;

-- Never expose canonical financial installments directly to anon.
REVOKE ALL ON TABLE public.os_finance_installments FROM anon;

-- Restrict clients to SELECT and a precise subset of updates.
-- No user-controlled INSERT/DELETE/TRUNCATE/TRIGGER/REFERENCES/MAINTAIN.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES, MAINTAIN
  ON TABLE public.os_finance_installments FROM authenticated;

GRANT UPDATE (status, notes, reviewed_at, reviewed_by)
  ON TABLE public.os_finance_installments TO authenticated;

DO $postcheck$
DECLARE
  v_col text;
BEGIN
  IF has_table_privilege('anon','public.os_finance_installments','SELECT')
    OR has_table_privilege('anon','public.os_finance_installments','INSERT')
    OR has_table_privilege('anon','public.os_finance_installments','UPDATE')
    OR has_table_privilege('anon','public.os_finance_installments','DELETE')
    OR has_table_privilege('anon','public.os_finance_installments','MAINTAIN')
    OR has_table_privilege('authenticated','public.os_finance_installments','INSERT')
    OR has_table_privilege('authenticated','public.os_finance_installments','UPDATE')
    OR has_table_privilege('authenticated','public.os_finance_installments','DELETE')
    OR has_table_privilege('authenticated','public.os_finance_installments','TRUNCATE')
    OR has_table_privilege('authenticated','public.os_finance_installments','TRIGGER')
    OR has_table_privilege('authenticated','public.os_finance_installments','REFERENCES')
    OR has_table_privilege('authenticated','public.os_finance_installments','MAINTAIN')
    OR NOT has_table_privilege('authenticated','public.os_finance_installments','SELECT')
  THEN
    RAISE EXCEPTION 'CANONICAL_FINANCE_ACL_POSTCHECK_FAILED' USING ERRCODE='55000';
  END IF;

  FOR v_col IN
    SELECT attname
    FROM pg_attribute
    WHERE attrelid='public.os_finance_installments'::regclass
      AND attnum>0 AND NOT attisdropped
  LOOP
    IF has_column_privilege('authenticated','public.os_finance_installments',v_col,'UPDATE')
      IS DISTINCT FROM (v_col IN ('status','notes','reviewed_at','reviewed_by'))
    THEN
      RAISE EXCEPTION 'CANONICAL_FINANCE_COLUMN_GRANT_INVALID: %', v_col
        USING ERRCODE='55000';
    END IF;
  END LOOP;

  IF NOT (
    has_table_privilege('service_role','public.os_finance_installments','SELECT')
    AND has_table_privilege('service_role','public.os_finance_installments','INSERT')
    AND has_table_privilege('service_role','public.os_finance_installments','UPDATE')
    AND has_table_privilege('service_role','public.os_finance_installments','DELETE')
    AND has_table_privilege('service_role','public.os_finance_installments','MAINTAIN')
    AND has_function_privilege(
      'authenticated','public.finance_upsert_from_asset(uuid,uuid,text,date)',
      'EXECUTE'
    )
  ) THEN
    RAISE EXCEPTION 'CANONICAL_FINANCE_PRIVILEGED_FLOW_POSTCHECK_FAILED' USING ERRCODE='55000';
  END IF;
END;
$postcheck$;

-- REVIEW ONLY. Not authorized for production execution.
