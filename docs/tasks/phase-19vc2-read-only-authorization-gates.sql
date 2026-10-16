-- EvoluSystem 19V-C2 — READ-ONLY evidence of dependent authorizers.
-- No transaction state, JWT impersonation, temp objects, DML, DDL or role SET.
-- IMPORTANT: Data API exposed-schema configuration is NOT verified here.
SELECT
  EXISTS(
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version='20261016124926'
      AND name='phase_19vc1_revoke_dangerous_legacy_table_privileges'
  ) AS c1_applied,
  (
    SELECT pg_get_userbyid(proowner)='postgres' AND prosecdef
       AND proconfig=ARRAY['search_path=public']::text[]
       AND md5(prosrc)='5855f6a54a28a3f37f3c2702a5b0ac82'
    FROM pg_proc WHERE oid='public.has_module_access(uuid,text)'::regprocedure
  ) AS module_authorizer_matches_baseline,
  (
    SELECT pg_get_userbyid(proowner)='postgres' AND prosecdef
       AND proconfig=ARRAY['search_path=public']::text[]
       AND md5(prosrc)='6c4acc49a3edd1a6b8b775f05e1e1e4f'
    FROM pg_proc WHERE oid='public.is_manager(uuid)'::regprocedure
  ) AS manager_authorizer_matches_baseline,
  has_function_privilege(
    'authenticated','public.has_module_access(uuid,text)','EXECUTE'
  ) AS auth_can_check_module,
  NOT has_function_privilege(
    'anon','public.has_module_access(uuid,text)','EXECUTE'
  ) AS anon_cannot_check_module,
  has_function_privilege(
    'authenticated','public.is_manager(uuid)','EXECUTE'
  ) AS auth_can_check_manager,
  NOT has_function_privilege(
    'anon','public.is_manager(uuid)','EXECUTE'
  ) AS anon_cannot_check_manager,
  (
    SELECT relrowsecurity FROM pg_class
    WHERE oid='public.user_module_access'::regclass
  ) AS module_acl_rls_enabled,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_module_access'
      AND policyname='user_module_access_insert_manager'
      AND cmd='INSERT' AND roles=ARRAY['authenticated']::name[]
      AND with_check='is_manager(auth.uid())'
  ) AS module_insert_requires_manager,
  NOT has_schema_privilege('authenticated','public','CREATE')
    AS authenticated_cannot_create_public_objects,
  NOT pg_has_role('authenticated','service_role','MEMBER')
    AS authenticated_no_service_role_membership,
  to_regnamespace('evolusystem_finance_private') IS NULL
    AS c2_private_schema_not_yet_created,
  has_table_privilege('authenticated','public.os','UPDATE')
    AS old_legacy_os_update_still_present;
