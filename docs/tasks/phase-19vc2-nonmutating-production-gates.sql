-- EvoluSystem 19V-C2 — non-mutating runtime readiness report
-- SELECT ONLY. No JWT impersonation, new objects, payment creation,
-- transaction locks, calling a financial RPC, or changes to live roles.
-- C2 is not installed yet; these tests do not homologate C2 behavior.
WITH flags AS (
  SELECT
    (SELECT COUNT(*) FROM public.os) AS legacy_os_count,
    (SELECT COUNT(*) FROM public.os_event) AS legacy_event_count,
    (SELECT COUNT(*) FROM public.os_payment_proof) AS legacy_proof_count,
    (SELECT COUNT(*) FROM public.os_event
     WHERE type='PAYMENT_SUBMITTED') AS actual_submissions,
    to_regnamespace('evolusystem_finance_private') IS NULL
      AS c2_still_uninstalled,
    EXISTS (
      SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE version='20261016124926'
        AND name='phase_19vc1_revoke_dangerous_legacy_table_privileges'
    ) AS c1_migration_present,
    EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid='public.finalize_legacy_payment_submission(uuid)'::regprocedure
        AND pg_get_userbyid(p.proowner)='postgres'
        AND NOT p.prosecdef
        AND p.proconfig=ARRAY['search_path=""']::text[]
        AND md5(p.prosrc)='cc781eed0a4c590edb7facc4c9a731fd'
    ) AS old_finance_rpc_verified,
    EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid='public.guard_legacy_payment_proof_mutations()'::regprocedure
        AND md5(p.prosrc)='8af26088723a9b4fb8dfb8863108affc'
        AND NOT p.prosecdef
    ) AS proof_immutability_guard_verified,
    EXISTS (
      SELECT 1
      FROM pg_class c JOIN pg_index i ON i.indexrelid=c.oid
      WHERE c.oid='public.os_event_payment_submission_once'::regclass
        AND i.indisunique AND i.indisvalid
        AND i.indrelid='public.os_event'::regclass
    ) AS unique_submission_index_valid,
    has_function_privilege(
      'authenticated','public.finalize_legacy_payment_submission(uuid)',
      'EXECUTE'
    ) AS authenticated_can_execute_rpc,
    NOT has_function_privilege(
      'anon','public.finalize_legacy_payment_submission(uuid)','EXECUTE'
    ) AS anon_cannot_execute_rpc,
    NOT pg_has_role('authenticated','service_role','MEMBER')
      AS auth_does_not_inherit_service,
    NOT has_schema_privilege('authenticated','public','CREATE')
      AS auth_cannot_create_public,
    (
      SELECT count(*)=3 FROM pg_class
      WHERE oid IN('public.os'::regclass,
                   'public.os_event'::regclass,
                   'public.os_payment_proof'::regclass)
        AND relrowsecurity
    ) AS all_legacy_financial_tables_have_rls,
    (
      SELECT count(*)=0
      FROM pg_trigger
      WHERE tgrelid IN('public.os'::regclass,'public.os_event'::regclass)
        AND NOT tgisinternal
    ) AS no_c2_triggers_installed,
    (
      SELECT count(*)=2
      FROM pg_constraint c
      WHERE c.contype='f'
        AND c.confrelid='public.os'::regclass
        AND c.confdeltype='c'
        AND c.convalidated
        AND c.conrelid IN('public.os_event'::regclass,
                          'public.os_payment_proof'::regclass)
    ) AS parent_cascade_fks_valid,
    (SELECT count(*)=0 FROM public.os_event
       WHERE type='PAYMENT_SUBMITTED'
         AND (payload->>'payment_id' IS NULL
           OR payload->>'status' IS NULL)) AS no_invalid_submitted_events
)
SELECT *,
  (legacy_os_count>0 AND legacy_proof_count>0
    AND actual_submissions>0) AS real_finance_evidence_available,
  FALSE AS c2_transactions_homologated,
  FALSE AS c2_concurrency_homologated,
  FALSE AS real_authenticated_jwt_homologated
FROM flags;
