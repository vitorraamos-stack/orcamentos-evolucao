-- Phase 19O: fix search_path on two legacy service-role-only administrative RPCs.
-- PROPOSAL ONLY: production migration and GitHub merge require SEPARATE explicit approvals.
-- DO NOT activate or rewrite these legacy RPCs. User management currently uses Supabase Admin API.
-- Known pre-existing defect: create_user_by_admin references missing auth.users.password column.
-- The function remains functionally defective until a separate deprecation/repair decision.
-- No user creation, deletion, function body replacement, privilege, RLS or data change.
-- create_user_by_admin requires crypt() and gen_salt() installed in the extensions schema.
-- NEVER change create_user_by_admin to search_path='' without rewriting qualified pgcrypto calls.

DO $preflight$
BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
      WHERE e.extname='pgcrypto' AND n.nspname='extensions'
    )
    OR to_regprocedure('extensions.crypt(text,text)') IS NULL
    OR to_regprocedure('extensions.gen_salt(text)') IS NULL
    OR has_schema_privilege('anon','extensions','CREATE')
    OR has_schema_privilege('authenticated','extensions','CREATE')
    OR has_schema_privilege('service_role','extensions','CREATE')
    OR NOT has_schema_privilege('service_role','extensions','USAGE')
  THEN RAISE EXCEPTION '19O_ABORTED_UNTRUSTED_OR_MISSING_CRYPTO_SCHEMA'; END IF;

  IF to_regprocedure('public.create_user_by_admin(text,text,text)') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE p.oid='public.create_user_by_admin(text,text,text)'::regprocedure
        AND n.nspname='public'
        AND pg_get_userbyid(p.proowner)='postgres'
        AND p.prosecdef
        AND p.prorettype='void'::regtype
        AND p.proconfig IS NULL
        AND md5(p.prosrc)='d0b3d48dd3a4295d2baa62e540fb4df0'
        AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}'
        AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
        AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
        AND has_function_privilege('service_role',p.oid,'EXECUTE')
    )
  THEN RAISE EXCEPTION '19O_ABORTED_PRECONDITION_CREATE_USER_BY_ADMIN'; END IF;

  IF to_regprocedure('public.delete_user_by_admin(uuid)') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE p.oid='public.delete_user_by_admin(uuid)'::regprocedure
        AND n.nspname='public'
        AND pg_get_userbyid(p.proowner)='postgres'
        AND p.prosecdef
        AND p.prorettype='void'::regtype
        AND p.proconfig IS NULL
        AND md5(p.prosrc)='a94f3fe569ff3b72f689755aa3f1cbfe'
        AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}'
        AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
        AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
        AND has_function_privilege('service_role',p.oid,'EXECUTE')
    )
  THEN RAISE EXCEPTION '19O_ABORTED_PRECONDITION_DELETE_USER_BY_ADMIN'; END IF;

END;
$preflight$;

-- Pin function-level lookup context only; preserve original implementation and grants.
ALTER FUNCTION public.create_user_by_admin(text,text,text) SET search_path TO pg_catalog, extensions;
ALTER FUNCTION public.delete_user_by_admin(uuid) SET search_path TO '';

DO $postcheck$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.oid='public.create_user_by_admin(text,text,text)'::regprocedure
      AND n.nspname='public'
      AND pg_get_userbyid(p.proowner)='postgres'
      AND p.prosecdef
      AND p.prorettype='void'::regtype
      AND md5(p.prosrc)='d0b3d48dd3a4295d2baa62e540fb4df0'
      AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}'
      AND p.proconfig @> ARRAY['search_path=pg_catalog, extensions']::text[]
      AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
      AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND has_function_privilege('service_role',p.oid,'EXECUTE')
  )
  THEN RAISE EXCEPTION '19O_ABORTED_POSTCONDITION_CREATE_USER_BY_ADMIN'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.oid='public.delete_user_by_admin(uuid)'::regprocedure
      AND n.nspname='public'
      AND pg_get_userbyid(p.proowner)='postgres'
      AND p.prosecdef
      AND p.prorettype='void'::regtype
      AND md5(p.prosrc)='a94f3fe569ff3b72f689755aa3f1cbfe'
      AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}'
      AND p.proconfig @> ARRAY['search_path=""']::text[]
      AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
      AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND has_function_privilege('service_role',p.oid,'EXECUTE')
  )
  THEN RAISE EXCEPTION '19O_ABORTED_POSTCONDITION_DELETE_USER_BY_ADMIN'; END IF;

END;
$postcheck$;
