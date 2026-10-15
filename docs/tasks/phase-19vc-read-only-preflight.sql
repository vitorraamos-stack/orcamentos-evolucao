-- EvoluSystem 19V-C: preflight 100% READ-ONLY, production-safe metadata.
-- Executed against prod schema on 2026-10-15; all baseline booleans true.
-- The *dangerous privilege still granted* flags must currently read true
-- until the separately approved 19V-C migration revokes them.
-- No DDL, DML, temp tables, role changes, or auth impersonation.
WITH checks AS (
  SELECT
    to_regprocedure('public.finalize_legacy_payment_submission(uuid)') IS NOT NULL
      AS has_19va_rpc,
    to_regprocedure('public.guard_legacy_payment_proof_mutations()') IS NOT NULL
      AS has_19t_guard,
    to_regnamespace('evolusystem_finance_private') IS NULL
      AS private_schema_absent,
    to_regprocedure('public.guard_legacy_financial_event_writes()') IS NULL
      AS new_event_guard_absent,
    to_regprocedure('public.guard_legacy_paid_os_deletion()') IS NULL
      AS new_os_delete_guard_absent,
    to_regprocedure('public.guard_legacy_os_financial_insert()') IS NULL
      AS new_os_insert_guard_absent,
    EXISTS (
      SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE version='20261015134750'
    ) AS has_19va_migration,
    (SELECT md5(prosrc) FROM pg_proc
      WHERE oid='public.finalize_legacy_payment_submission(uuid)'::regprocedure
    )='cc781eed0a4c590edb7facc4c9a731fd' AS unchanged_19va_body,
    (SELECT md5(prosrc) FROM pg_proc
      WHERE oid='public.guard_legacy_payment_proof_mutations()'::regprocedure
    )='8af26088723a9b4fb8dfb8863108affc' AS unchanged_19t_body,
    NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid IN ('public.os'::regclass,'public.os_event'::regclass)
        AND NOT tgisinternal
    ) AS no_legacy_os_event_custom_triggers,
    EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid='public.os_payment_proof'::regclass
        AND tgname='trg_guard_legacy_payment_proof_mutations'
        AND tgenabled='O'
    ) AS proof_guard_enabled,
    (SELECT count(*) FROM pg_class
      WHERE oid IN ('public.os'::regclass,'public.os_event'::regclass,
        'public.os_payment_proof'::regclass) AND relrowsecurity
    )=3 AS all_three_tables_rls,
    (SELECT count(*) FROM pg_constraint
      WHERE conname IN (
        'os_payment_proof_os_id_fkey','os_event_os_id_fkey'
      ) AND contype='f' AND confdeltype='c'
    )=2 AS cascading_fk_baseline,
    NOT pg_has_role('authenticated','postgres','MEMBER')
      AS auth_not_postgres,
    NOT pg_has_role('authenticated','service_role','MEMBER')
      AS auth_not_service,
    pg_catalog.has_table_privilege('authenticated','public.os','TRUNCATE')
      AS dangerous_legacy_truncate_still_granted,
    pg_catalog.has_table_privilege('authenticated','public.os','UPDATE')
      AS legacy_update_still_granted,
    pg_catalog.has_table_privilege('authenticated','public.os_event','INSERT')
      AS legacy_event_insert_still_granted,
    pg_catalog.has_function_privilege(
      'authenticated','public.finalize_legacy_payment_submission(uuid)','EXECUTE'
    ) AS auth_can_call_current_rpc,
    NOT pg_catalog.has_function_privilege(
      'anon','public.finalize_legacy_payment_submission(uuid)','EXECUTE'
    ) AS anon_cannot_call_rpc
)
SELECT * FROM checks;
