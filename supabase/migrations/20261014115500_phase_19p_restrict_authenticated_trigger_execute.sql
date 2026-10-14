-- Phase 19P: revoke unnecessary authenticated EXECUTE from two existing privileged trigger functions.
-- PROPOSAL: applying to Supabase production and merging into main require separate explicit approvals.
-- One active trigger exists per function; trigger definitions, bodies, security mode and owners stay unchanged.
-- Trigger functions cannot be invoked as ordinary SQL RPCs (return type trigger). This targets excessive
-- EXECUTE ACLs and two conservative Security Advisor findings, NOT a demonstrated exploit.
-- The existing signup trigger must retain supabase_auth_admin EXECUTE for creation/maintenance.
-- For installed triggers, PostgreSQL checks EXECUTE at trigger creation, not at firing in current versions.
-- End-to-end signup and finance flow tests are still required in a controlled environment.

DO $preflight$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') THEN
    RAISE EXCEPTION '19P_ABORTED_AUTH_BACKEND_MISSING';
  END IF;

  IF to_regprocedure('public.handle_new_user()') IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.oid='public.handle_new_user()'::regprocedure AND n.nspname='public'
      AND p.prosecdef AND p.prorettype='trigger'::regtype
      AND pg_get_userbyid(p.proowner)='postgres'
      AND p.proconfig=ARRAY['search_path=public']::text[]
      AND md5(p.prosrc)='f68b64ac522c5569117b4c2c7a4241a9'
      AND p.proacl::text='{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,supabase_auth_admin=X/postgres}'
      AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
      AND has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND has_function_privilege('service_role',p.oid,'EXECUTE')
      AND has_function_privilege('supabase_auth_admin',p.oid,'EXECUTE')
  ) OR (
    SELECT COUNT(*) FROM pg_trigger t
    WHERE t.tgfoid='public.handle_new_user()'::regprocedure AND NOT t.tgisinternal
  )<>1 OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgfoid='public.handle_new_user()'::regprocedure
      AND NOT t.tgisinternal
      AND t.tgname='on_auth_user_created'
      AND t.tgrelid='auth.users'::regclass
      AND t.tgenabled='O'
      AND pg_get_triggerdef(t.oid,true)='CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user()'
  )
  THEN RAISE EXCEPTION '19P_ABORTED_PRECONDITION_HANDLE_NEW_USER'; END IF;

  IF to_regprocedure('public.os_finance_installment_audit_trigger()') IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.oid='public.os_finance_installment_audit_trigger()'::regprocedure AND n.nspname='public'
      AND p.prosecdef AND p.prorettype='trigger'::regtype
      AND pg_get_userbyid(p.proowner)='postgres'
      AND p.proconfig=ARRAY['search_path=public']::text[]
      AND md5(p.prosrc)='df7e652e9ec347cdd3583209e9b0d44f'
      AND p.proacl::text='{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
      AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
      AND has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND has_function_privilege('service_role',p.oid,'EXECUTE')
      AND NOT has_function_privilege('supabase_auth_admin',p.oid,'EXECUTE')
  ) OR (
    SELECT COUNT(*) FROM pg_trigger t
    WHERE t.tgfoid='public.os_finance_installment_audit_trigger()'::regprocedure AND NOT t.tgisinternal
  )<>1 OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgfoid='public.os_finance_installment_audit_trigger()'::regprocedure
      AND NOT t.tgisinternal
      AND t.tgname='trg_os_finance_installment_audit'
      AND t.tgrelid='public.os_finance_installments'::regclass
      AND t.tgenabled='O'
      AND pg_get_triggerdef(t.oid,true)='CREATE TRIGGER trg_os_finance_installment_audit AFTER UPDATE OF status, notes ON os_finance_installments FOR EACH ROW EXECUTE FUNCTION os_finance_installment_audit_trigger()'
  )
  THEN RAISE EXCEPTION '19P_ABORTED_PRECONDITION_OS_FINANCE_INSTALLMENT_AUDIT_TRIGGER'; END IF;

END;
$preflight$;

-- Scope: only revoke direct authenticated EXECUTE; keep the existing service and Auth backend grants.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.os_finance_installment_audit_trigger() FROM authenticated;

DO $postcheck$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.oid='public.handle_new_user()'::regprocedure AND n.nspname='public'
      AND p.prosecdef AND p.prorettype='trigger'::regtype
      AND pg_get_userbyid(p.proowner)='postgres'
      AND p.proconfig=ARRAY['search_path=public']::text[]
      AND md5(p.prosrc)='f68b64ac522c5569117b4c2c7a4241a9'
      AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres,supabase_auth_admin=X/postgres}'
      AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
      AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND has_function_privilege('service_role',p.oid,'EXECUTE')
      AND has_function_privilege('supabase_auth_admin',p.oid,'EXECUTE')
  ) OR (
    SELECT COUNT(*) FROM pg_trigger t
    WHERE t.tgfoid='public.handle_new_user()'::regprocedure AND NOT t.tgisinternal
  )<>1 OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgfoid='public.handle_new_user()'::regprocedure
      AND NOT t.tgisinternal
      AND t.tgname='on_auth_user_created'
      AND t.tgrelid='auth.users'::regclass
      AND t.tgenabled='O'
      AND pg_get_triggerdef(t.oid,true)='CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user()'
  )
  THEN RAISE EXCEPTION '19P_ABORTED_POSTCONDITION_HANDLE_NEW_USER'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.oid='public.os_finance_installment_audit_trigger()'::regprocedure AND n.nspname='public'
      AND p.prosecdef AND p.prorettype='trigger'::regtype
      AND pg_get_userbyid(p.proowner)='postgres'
      AND p.proconfig=ARRAY['search_path=public']::text[]
      AND md5(p.prosrc)='df7e652e9ec347cdd3583209e9b0d44f'
      AND p.proacl::text='{postgres=X/postgres,service_role=X/postgres}'
      AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
      AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND has_function_privilege('service_role',p.oid,'EXECUTE')
      AND NOT has_function_privilege('supabase_auth_admin',p.oid,'EXECUTE')
  ) OR (
    SELECT COUNT(*) FROM pg_trigger t
    WHERE t.tgfoid='public.os_finance_installment_audit_trigger()'::regprocedure AND NOT t.tgisinternal
  )<>1 OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgfoid='public.os_finance_installment_audit_trigger()'::regprocedure
      AND NOT t.tgisinternal
      AND t.tgname='trg_os_finance_installment_audit'
      AND t.tgrelid='public.os_finance_installments'::regclass
      AND t.tgenabled='O'
      AND pg_get_triggerdef(t.oid,true)='CREATE TRIGGER trg_os_finance_installment_audit AFTER UPDATE OF status, notes ON os_finance_installments FOR EACH ROW EXECUTE FUNCTION os_finance_installment_audit_trigger()'
  )
  THEN RAISE EXCEPTION '19P_ABORTED_POSTCONDITION_OS_FINANCE_INSTALLMENT_AUDIT_TRIGGER'; END IF;

END;
$postcheck$;
