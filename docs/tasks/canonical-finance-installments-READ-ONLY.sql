-- EvoluSystem — CURRENT finance-installment grants (READ ONLY)
-- Confirm browser-facing roles, grants, table metadata and routines.
-- Never writes data, changes roles or starts a transaction.
SELECT r.rolname AS role_name,
  has_table_privilege(r.rolname,'public.os_finance_installments','SELECT') AS table_select,
  has_table_privilege(r.rolname,'public.os_finance_installments','INSERT') AS table_insert,
  has_table_privilege(r.rolname,'public.os_finance_installments','UPDATE') AS table_update,
  has_table_privilege(r.rolname,'public.os_finance_installments','DELETE') AS table_delete,
  has_table_privilege(r.rolname,'public.os_finance_installments','TRUNCATE') AS table_truncate,
  has_table_privilege(r.rolname,'public.os_finance_installments','TRIGGER') AS table_trigger,
  has_table_privilege(r.rolname,'public.os_finance_installments','REFERENCES') AS table_references,
  has_table_privilege(r.rolname,'public.os_finance_installments','MAINTAIN') AS table_maintain
FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')
ORDER BY role_name;

SELECT a.attname AS column_name,
 has_column_privilege('authenticated','public.os_finance_installments',a.attname,'UPDATE')
    AS browser_update_permitted
FROM pg_attribute a
WHERE a.attrelid='public.os_finance_installments'::regclass
  AND a.attnum>0 AND NOT a.attisdropped
ORDER BY a.attnum;

SELECT
 (SELECT count(*) FROM public.os) AS legacy_os_count,
 (SELECT count(*) FROM public.os_orders) AS canonical_os_count,
 (SELECT count(*) FROM public.os_finance_installments) AS canonical_finance_count,
 to_regnamespace('evolusystem_finance_private') IS NULL AS c2_still_not_installed,
 (SELECT md5(prosrc) FROM pg_proc
  WHERE oid='public.finance_upsert_from_asset(uuid,uuid,text,date)'::regprocedure)
  AS finance_upsert_code_hash;
