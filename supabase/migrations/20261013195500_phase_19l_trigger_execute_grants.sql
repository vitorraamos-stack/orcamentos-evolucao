-- Phase 19L: remove PUBLIC/anon EXECUTE from two privileged trigger functions.
-- Proposal ONLY. Applying to production and merging require separate explicit approvals.
-- Both existing triggers remain attached, enabled, and their SECURITY DEFINER bodies unchanged.
-- PostgreSQL checks EXECUTE at CREATE TRIGGER time, not when an existing trigger fires;
-- the auth backend role receives an explicit EXECUTE grant for future auth trigger maintenance.

DO $preflight$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    RAISE EXCEPTION '19L_ABORTED_AUTH_BACKEND_ROLE_MISSING';
  END IF;

  IF to_regprocedure('public.handle_new_user()') IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.oid='public.handle_new_user()'::regprocedure
      AND n.nspname='public'
      AND p.prosecdef
      AND p.prorettype = 'trigger'::regtype
      AND pg_get_userbyid(p.proowner)='postgres'
      AND p.prosrc LIKE '%insert into public.profiles%'
      AND has_function_privilege('anon',p.oid,'EXECUTE')
      AND has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND has_function_privilege('service_role',p.oid,'EXECUTE')
  ) THEN
    RAISE EXCEPTION '19L_ABORTED_UNEXPECTED_FUNCTION_HANDLE_NEW_USER';
  END IF;

  IF (SELECT count(*) FROM pg_trigger t WHERE t.tgfoid='public.handle_new_user()'::regprocedure AND NOT t.tgisinternal) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgname='on_auth_user_created'
        AND t.tgrelid='auth.users'::regclass
        AND t.tgfoid='public.handle_new_user()'::regprocedure
        AND NOT t.tgisinternal
        AND t.tgenabled='O'
        AND pg_get_triggerdef(t.oid,true) LIKE '%AFTER INSERT ON auth.users%'
        AND pg_get_triggerdef(t.oid,true) LIKE '%EXECUTE FUNCTION handle_new_user()%'
    )
  THEN
    RAISE EXCEPTION '19L_ABORTED_UNEXPECTED_TRIGGER_ON_AUTH_USER_CREATED';
  END IF;

  IF to_regprocedure('public.os_finance_installment_audit_trigger()') IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.oid='public.os_finance_installment_audit_trigger()'::regprocedure
      AND n.nspname='public'
      AND p.prosecdef
      AND p.prorettype = 'trigger'::regtype
      AND pg_get_userbyid(p.proowner)='postgres'
      AND p.prosrc LIKE '%FINANCE_INSTALLMENT_STATUS_CHANGED%'
      AND has_function_privilege('anon',p.oid,'EXECUTE')
      AND has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND has_function_privilege('service_role',p.oid,'EXECUTE')
  ) THEN
    RAISE EXCEPTION '19L_ABORTED_UNEXPECTED_FUNCTION_OS_FINANCE_INSTALLMENT_AUDIT_TRIGGER';
  END IF;

  IF (SELECT count(*) FROM pg_trigger t WHERE t.tgfoid='public.os_finance_installment_audit_trigger()'::regprocedure AND NOT t.tgisinternal) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgname='trg_os_finance_installment_audit'
        AND t.tgrelid='public.os_finance_installments'::regclass
        AND t.tgfoid='public.os_finance_installment_audit_trigger()'::regprocedure
        AND NOT t.tgisinternal
        AND t.tgenabled='O'
        AND pg_get_triggerdef(t.oid,true) LIKE '%AFTER UPDATE OF status, notes ON os_finance_installments%'
        AND pg_get_triggerdef(t.oid,true) LIKE '%EXECUTE FUNCTION os_finance_installment_audit_trigger()%'
    )
  THEN
    RAISE EXCEPTION '19L_ABORTED_UNEXPECTED_TRIGGER_TRG_OS_FINANCE_INSTALLMENT_AUDIT';
  END IF;

END;
$preflight$;

-- Narrow invocability: trigger functions are not user-facing RPCs.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated, service_role, supabase_auth_admin;

REVOKE EXECUTE ON FUNCTION public.os_finance_installment_audit_trigger() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.os_finance_installment_audit_trigger() TO authenticated, service_role;

DO $postcheck$
BEGIN
  IF has_function_privilege('anon','public.handle_new_user()','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.handle_new_user()','EXECUTE')
    OR NOT has_function_privilege('service_role','public.handle_new_user()','EXECUTE')
    OR NOT EXISTS (
      SELECT 1 FROM pg_proc p WHERE p.oid='public.handle_new_user()'::regprocedure
        AND p.prosecdef AND p.prorettype='trigger'::regtype
        AND pg_get_userbyid(p.proowner)='postgres'
        AND p.prosrc LIKE '%insert into public.profiles%'
    )
    OR (SELECT count(*) FROM pg_trigger t
        WHERE t.tgfoid='public.handle_new_user()'::regprocedure AND NOT t.tgisinternal) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgname='on_auth_user_created'
        AND t.tgrelid='auth.users'::regclass
        AND t.tgfoid='public.handle_new_user()'::regprocedure
        AND t.tgenabled='O'
    )
    OR NOT has_function_privilege('supabase_auth_admin','public.handle_new_user()','EXECUTE')
  THEN RAISE EXCEPTION '19L_ABORTED_POSTCONDITION_HANDLE_NEW_USER'; END IF;

  IF has_function_privilege('anon','public.os_finance_installment_audit_trigger()','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.os_finance_installment_audit_trigger()','EXECUTE')
    OR NOT has_function_privilege('service_role','public.os_finance_installment_audit_trigger()','EXECUTE')
    OR NOT EXISTS (
      SELECT 1 FROM pg_proc p WHERE p.oid='public.os_finance_installment_audit_trigger()'::regprocedure
        AND p.prosecdef AND p.prorettype='trigger'::regtype
        AND pg_get_userbyid(p.proowner)='postgres'
        AND p.prosrc LIKE '%FINANCE_INSTALLMENT_STATUS_CHANGED%'
    )
    OR (SELECT count(*) FROM pg_trigger t
        WHERE t.tgfoid='public.os_finance_installment_audit_trigger()'::regprocedure AND NOT t.tgisinternal) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgname='trg_os_finance_installment_audit'
        AND t.tgrelid='public.os_finance_installments'::regclass
        AND t.tgfoid='public.os_finance_installment_audit_trigger()'::regprocedure
        AND t.tgenabled='O'
    )
  THEN RAISE EXCEPTION '19L_ABORTED_POSTCONDITION_OS_FINANCE_INSTALLMENT_AUDIT_TRIGGER'; END IF;

END;
$postcheck$;
