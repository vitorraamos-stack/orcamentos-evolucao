-- 19K: restrict anonymous execution of privileged role/module lookup helpers.
-- Proposal only. Requires separate authorization to apply to Supabase production.
-- No data modifications, RLS policy changes, function redefinitions or trigger changes.

DO $preflight$
BEGIN
  -- Fail closed if an anonymous/public RLS policy depends on these helpers.
  -- Policies targeted at authenticated sessions (including storage.objects) are preserved.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE roles && ARRAY['anon','public']::name[]
      AND (coalesce(qual,'') || coalesce(with_check,'')) ~ '(has_module_access|is_admin|is_manager)'
  ) THEN
    RAISE EXCEPTION '19K_ABORTED_ANONYMOUS_POLICY_DEPENDENCY';
  END IF;

  IF to_regprocedure('public.has_module_access(uuid,text)') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc p
       WHERE p.oid = 'public.has_module_access(uuid,text)'::regprocedure
         AND p.prosecdef
         AND p.prorettype = 'boolean'::regtype
         AND has_function_privilege('anon',p.oid,'EXECUTE')
         AND has_function_privilege('authenticated',p.oid,'EXECUTE')
         AND has_function_privilege('service_role',p.oid,'EXECUTE')
         AND p.prosrc LIKE '%uma.user_id = uid%'
     )
  THEN RAISE EXCEPTION '19K_ABORTED_UNEXPECTED_HELPER_HAS_MODULE_ACCESS'; END IF;

  IF to_regprocedure('public.is_admin(uuid)') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc p
       WHERE p.oid = 'public.is_admin(uuid)'::regprocedure
         AND p.prosecdef
         AND p.prorettype = 'boolean'::regtype
         AND has_function_privilege('anon',p.oid,'EXECUTE')
         AND has_function_privilege('authenticated',p.oid,'EXECUTE')
         AND has_function_privilege('service_role',p.oid,'EXECUTE')
         AND p.prosrc LIKE '%p.role in (''admin'', ''gerente'')%'
     )
  THEN RAISE EXCEPTION '19K_ABORTED_UNEXPECTED_HELPER_IS_ADMIN'; END IF;

  IF to_regprocedure('public.is_manager(uuid)') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc p
       WHERE p.oid = 'public.is_manager(uuid)'::regprocedure
         AND p.prosecdef
         AND p.prorettype = 'boolean'::regtype
         AND has_function_privilege('anon',p.oid,'EXECUTE')
         AND has_function_privilege('authenticated',p.oid,'EXECUTE')
         AND has_function_privilege('service_role',p.oid,'EXECUTE')
         AND p.prosrc LIKE '%p.role in (''admin'', ''gerente'')%'
     )
  THEN RAISE EXCEPTION '19K_ABORTED_UNEXPECTED_HELPER_IS_MANAGER'; END IF;

END;
$preflight$;

-- Preserve existing RLS policies: authenticated callers still have EXECUTE.
REVOKE EXECUTE ON FUNCTION public.has_module_access(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_module_access(uuid,text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_manager(uuid) TO authenticated, service_role;

DO $postcheck$
BEGIN
  IF has_function_privilege('anon','public.has_module_access(uuid,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.has_module_access(uuid,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.has_module_access(uuid,text)','EXECUTE')
    OR NOT EXISTS (
      SELECT 1 FROM pg_proc p WHERE p.oid = 'public.has_module_access(uuid,text)'::regprocedure
       AND p.prosecdef AND p.prosrc LIKE '%uma.user_id = uid%'
    )
  THEN RAISE EXCEPTION '19K_ABORTED_HELPER_POSTCONDITION_HAS_MODULE_ACCESS'; END IF;

  IF has_function_privilege('anon','public.is_admin(uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.is_admin(uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.is_admin(uuid)','EXECUTE')
    OR NOT EXISTS (
      SELECT 1 FROM pg_proc p WHERE p.oid = 'public.is_admin(uuid)'::regprocedure
       AND p.prosecdef AND p.prosrc LIKE '%p.role in (''admin'', ''gerente'')%'
    )
  THEN RAISE EXCEPTION '19K_ABORTED_HELPER_POSTCONDITION_IS_ADMIN'; END IF;

  IF has_function_privilege('anon','public.is_manager(uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.is_manager(uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.is_manager(uuid)','EXECUTE')
    OR NOT EXISTS (
      SELECT 1 FROM pg_proc p WHERE p.oid = 'public.is_manager(uuid)'::regprocedure
       AND p.prosecdef AND p.prosrc LIKE '%p.role in (''admin'', ''gerente'')%'
    )
  THEN RAISE EXCEPTION '19K_ABORTED_HELPER_POSTCONDITION_IS_MANAGER'; END IF;

END;
$postcheck$;
