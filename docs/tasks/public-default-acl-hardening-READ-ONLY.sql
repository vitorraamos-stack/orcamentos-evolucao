-- EvoluSystem — future public-table ACL baseline: READ ONLY.
-- Intended for preflight review, not for testing by creating a table.
-- Execute SELECT only. This will NOT verify PostgREST UI settings.
WITH defaults AS (
  SELECT pg_get_userbyid(d.defaclrole) AS owner,
         n.nspname AS schema_name,
         d.defaclobjtype AS object_type,
         COALESCE(r.rolname, 'PUBLIC') AS grantee,
         x.privilege_type
  FROM pg_default_acl d
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) x
  LEFT JOIN pg_roles r ON r.oid = x.grantee
  WHERE n.nspname = 'public' AND d.defaclobjtype = 'r'
)
SELECT owner, schema_name, grantee,
       array_agg(privilege_type ORDER BY privilege_type) AS table_default_privileges,
       count(*) FILTER (
         WHERE privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
       ) AS elevated_privileges_count
FROM defaults
WHERE grantee IN ('anon','authenticated','service_role')
GROUP BY owner,schema_name,grantee
ORDER BY owner,grantee;

SELECT
  current_user::text AS running_role,
  current_setting('server_version_num')::integer AS postgres_version,
  pg_has_role('postgres','supabase_admin','MEMBER')
    AS postgres_can_manage_supabase_admin,
  EXISTS(
    SELECT 1 FROM pg_default_acl
    WHERE defaclrole='postgres'::regrole
      AND defaclobjtype='r' AND defaclnamespace=0
  ) AS postgres_global_table_defaults_present,
  EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version='20261016124926'
  ) AS c1_recorded,
  (SELECT count(*) FROM pg_class
   WHERE relnamespace='public'::regnamespace
     AND relkind IN('r','p')) AS existing_public_tables,
  (SELECT count(*) FROM pg_class
   WHERE relnamespace='public'::regnamespace
     AND relkind IN('r','p') AND relrowsecurity
  ) AS existing_public_tables_with_rls;
