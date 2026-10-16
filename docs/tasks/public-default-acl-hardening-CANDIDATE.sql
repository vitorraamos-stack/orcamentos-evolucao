-- EvoluSystem — future-table default-ACL hardening.
-- REVIEW CANDIDATE, NOT APPLIED. DO NOT RUN ON PRODUCTION.
-- Only authorized future migration may move this out of docs/tasks.
--
-- Purpose: newly created public tables owned by postgres must not
-- inherit TRUNCATE, TRIGGER, REFERENCES or MAINTAIN privileges for the
-- Data API client roles (anon, authenticated).
--
-- This changes DEFAULT privileges of *future* tables created by postgres.
-- It does NOT change existing objects, policies, data, RPCs, or service_role.
-- This deliberately does not touch supabase_admin's separate default ACL:
-- current postgres role cannot administer that role; a separate Supabase
-- compatibility/owner review would be required.
--
-- PostgreSQL 17+ is required for MAINTAIN in ALTER DEFAULT PRIVILEGES.

DO $preflight$
DECLARE
  v_schema oid := 'public'::regnamespace;
  v_owner oid := 'postgres'::regrole;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'DEFAULT_ACL_UNEXPECTED_EXECUTION_ROLE'
      USING ERRCODE = '42501';
  END IF;

  IF current_setting('server_version_num')::integer < 170000 THEN
    RAISE EXCEPTION 'DEFAULT_ACL_REQUIRES_PG17_FOR_MAINTAIN'
      USING ERRCODE = '55000';
  END IF;

  -- A per-schema REVOKE cannot undo a global default GRANT.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_default_acl d
    WHERE d.defaclrole = v_owner
      AND d.defaclobjtype = 'r'
      AND d.defaclnamespace = 0
  ) THEN
    RAISE EXCEPTION 'DEFAULT_ACL_GLOBAL_TABLE_GRANTS_REQUIRE_REVIEW'
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_default_acl d
    WHERE d.defaclrole = v_owner
      AND d.defaclobjtype = 'r'
      AND d.defaclnamespace = v_schema
  ) THEN
    RAISE EXCEPTION 'DEFAULT_ACL_PUBLIC_POSTGRES_BASELINE_MISSING'
      USING ERRCODE = '55000';
  END IF;

  -- The Data API setting has already revoked ordinary CRUD defaults
  -- for postgres-owned public tables. Abort if it is silently reversed.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl d
    CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) x
    JOIN pg_catalog.pg_roles r ON r.oid = x.grantee
    WHERE d.defaclrole = v_owner
      AND d.defaclnamespace = v_schema
      AND d.defaclobjtype = 'r'
      AND r.rolname IN ('anon', 'authenticated')
      AND x.privilege_type NOT IN
        ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
  ) THEN
    RAISE EXCEPTION 'DEFAULT_ACL_DATA_API_SETTING_DRIFT'
      USING ERRCODE = '55000';
  END IF;

  -- Exactly four elevated default table privileges per client role.
  IF (
    SELECT count(*)
    FROM pg_catalog.pg_default_acl d
    CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) x
    JOIN pg_catalog.pg_roles r ON r.oid = x.grantee
    WHERE d.defaclrole = v_owner
      AND d.defaclnamespace = v_schema
      AND d.defaclobjtype = 'r'
      AND r.rolname IN ('anon', 'authenticated')
      AND x.privilege_type IN
        ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
  ) <> 8 THEN
    RAISE EXCEPTION 'DEFAULT_ACL_CLIENT_PRIVILEGES_BASELINE_DRIFT'
      USING ERRCODE = '55000';
  END IF;

  -- Keep service_role maintenance grants unchanged by this proposal.
  IF (
    SELECT count(*)
    FROM pg_catalog.pg_default_acl d
    CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) x
    JOIN pg_catalog.pg_roles r ON r.oid = x.grantee
    WHERE d.defaclrole = v_owner
      AND d.defaclnamespace = v_schema
      AND d.defaclobjtype = 'r'
      AND r.rolname = 'service_role'
      AND x.privilege_type IN
        ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
  ) <> 4 THEN
    RAISE EXCEPTION 'DEFAULT_ACL_SERVICE_ROLE_BASELINE_DRIFT'
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '20261016124926'
      AND name = 'phase_19vc1_revoke_dangerous_legacy_table_privileges'
  ) THEN
    RAISE EXCEPTION 'DEFAULT_ACL_19VC1_MISSING'
      USING ERRCODE = '55000';
  END IF;
END;
$preflight$;

-- PostgreSQL 17 default-privilege syntax.
-- Applies only to FUTURE public tables created under ROLE postgres.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLES FROM anon, authenticated;

DO $postcheck$
DECLARE
  v_schema oid := 'public'::regnamespace;
  v_owner oid := 'postgres'::regrole;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl d
    CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) x
    JOIN pg_catalog.pg_roles r ON r.oid = x.grantee
    WHERE d.defaclrole = v_owner
      AND d.defaclnamespace = v_schema
      AND d.defaclobjtype = 'r'
      AND r.rolname IN ('anon', 'authenticated')
  ) THEN
    RAISE EXCEPTION 'DEFAULT_ACL_CLIENT_GRANTS_SURVIVED'
      USING ERRCODE = '55000';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_default_acl d
    CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) x
    JOIN pg_catalog.pg_roles r ON r.oid = x.grantee
    WHERE d.defaclrole = v_owner
      AND d.defaclnamespace = v_schema
      AND d.defaclobjtype = 'r'
      AND r.rolname = 'service_role'
      AND x.privilege_type IN
        ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
  ) <> 4 THEN
    RAISE EXCEPTION 'DEFAULT_ACL_SERVICE_ROLE_REGRESSION'
      USING ERRCODE = '55000';
  END IF;

  -- C1 protects the legacy objects already present today.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    WHERE c.oid IN (
      'public.os'::regclass,
      'public.os_event'::regclass,
      'public.os_payment_proof'::regclass
    )
    AND (
      pg_catalog.has_table_privilege('anon', c.oid, 'TRUNCATE')
      OR pg_catalog.has_table_privilege('authenticated', c.oid, 'TRUNCATE')
      OR pg_catalog.has_table_privilege('authenticated', c.oid, 'TRIGGER')
      OR pg_catalog.has_table_privilege('authenticated', c.oid, 'REFERENCES')
    )
  ) THEN
    RAISE EXCEPTION 'DEFAULT_ACL_EXISTING_19VC1_GRANTS_REGRESSION'
      USING ERRCODE = '55000';
  END IF;
END;
$postcheck$;
