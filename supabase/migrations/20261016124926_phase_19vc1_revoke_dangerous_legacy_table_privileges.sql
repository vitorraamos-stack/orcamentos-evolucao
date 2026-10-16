-- EvoluSystem 19V-C1 — privileged table grants only. No data writes.
-- SECURITY: TRUNCATE and REFERENCES bypass RLS; these privileges are not
-- required by the published Supabase JS OS/finance/production workflows.
-- Scope: PUBLIC legacy OS tables only, anon and authenticated roles only.
DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version='20261015134750'
  ) OR to_regnamespace('evolusystem_finance_private') IS NOT NULL
  THEN RAISE EXCEPTION '19VC1_UNEXPECTED_MIGRATION_STATE' USING ERRCODE='55000'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.finalize_legacy_payment_submission(uuid)'::regprocedure
      AND md5(p.prosrc)='cc781eed0a4c590edb7facc4c9a731fd'
      AND NOT p.prosecdef
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.guard_legacy_payment_proof_mutations()'::regprocedure
      AND md5(p.prosrc)='8af26088723a9b4fb8dfb8863108affc'
  ) THEN RAISE EXCEPTION '19VC1_FINANCE_FUNCTION_DRIFT' USING ERRCODE='55000'; END IF;

  IF NOT has_table_privilege('authenticated','public.os','TRUNCATE')
     OR NOT has_table_privilege('anon','public.os','TRUNCATE')
     OR NOT has_table_privilege('authenticated','public.os','TRIGGER')
     OR NOT has_table_privilege('authenticated','public.os','REFERENCES')
     OR NOT has_table_privilege('authenticated','public.os_event','REFERENCES')
     OR NOT has_table_privilege('authenticated','public.os_payment_proof','REFERENCES')
  THEN RAISE EXCEPTION '19VC1_PRIVILEGE_BASELINE_DRIFT' USING ERRCODE='55000'; END IF;

  IF (SELECT count(*) FROM pg_class c WHERE
      c.oid IN ('public.os'::regclass,'public.os_event'::regclass,
                'public.os_payment_proof'::regclass)
      AND c.relrowsecurity)=0
  THEN RAISE EXCEPTION '19VC1_RLS_MISSING' USING ERRCODE='55000'; END IF;
END;
$preflight$;

REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE
  public.os, public.os_event, public.os_payment_proof
FROM anon, authenticated;

DO $postcheck$
DECLARE
  v_relation regclass;
  v_role name;
  v_privilege text;
BEGIN
  FOREACH v_relation IN ARRAY ARRAY[
    'public.os'::regclass,
    'public.os_event'::regclass,
    'public.os_payment_proof'::regclass
  ] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon'::name,'authenticated'::name] LOOP
      FOREACH v_privilege IN ARRAY ARRAY['TRUNCATE','TRIGGER','REFERENCES'] LOOP
        IF has_table_privilege(v_role::text,v_relation,v_privilege) THEN
          RAISE EXCEPTION '19VC1_DANGEROUS_GRANT_SURVIVED % % %',
            v_role,v_relation,v_privilege USING ERRCODE='55000';
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  IF NOT has_table_privilege('authenticated','public.os','SELECT')
    OR NOT has_table_privilege('authenticated','public.os','INSERT')
    OR NOT has_table_privilege('authenticated','public.os','UPDATE')
    OR NOT has_table_privilege('authenticated','public.os','DELETE')
    OR NOT has_table_privilege('authenticated','public.os_event','INSERT')
    OR NOT has_table_privilege('authenticated','public.os_event','DELETE')
    OR NOT has_table_privilege('authenticated','public.os_payment_proof','UPDATE')
    OR NOT has_table_privilege('authenticated','public.os_payment_proof','INSERT')
    OR NOT has_table_privilege('service_role','public.os','TRUNCATE')
    OR NOT has_function_privilege(
      'authenticated','public.finalize_legacy_payment_submission(uuid)','EXECUTE')
  THEN RAISE EXCEPTION '19VC1_OPERATIONAL_PRIVILEGE_REGRESSION'
    USING ERRCODE='55000'; END IF;
END;
$postcheck$;
