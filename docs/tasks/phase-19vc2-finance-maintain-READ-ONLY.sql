-- EvoluSystem 19V-C2 — legacy finance MAINTAIN baseline (READ ONLY)
-- PostgreSQL 17+; no role changes, no DDL, no test data.
WITH targets(relid) AS (
 VALUES ('public.os'::regclass),
        ('public.os_event'::regclass),
        ('public.os_payment_proof'::regclass)
), roles(role_name) AS (
 VALUES ('anon'::name),('authenticated'::name),('service_role'::name)
)
SELECT
  relid::text AS table_name,
  role_name::text AS role_name,
  pg_catalog.has_table_privilege(role_name,relid,'MAINTAIN')
    AS current_maintain_privilege,
  pg_catalog.has_table_privilege(role_name,relid,'TRUNCATE')
    AS current_truncate_privilege,
  pg_catalog.has_table_privilege(role_name,relid,'TRIGGER')
    AS current_trigger_privilege,
  pg_catalog.has_table_privilege(role_name,relid,'REFERENCES')
    AS current_references_privilege
FROM targets CROSS JOIN roles
ORDER BY table_name,role_name;
