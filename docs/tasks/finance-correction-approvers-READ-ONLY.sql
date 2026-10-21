-- EvoluSystem: approval eligibility baseline (SELECT ONLY).
-- Aggregate output; no names, emails, user IDs or test financial writes.
SELECT
 EXISTS(SELECT 1 FROM public.app_modules
        WHERE module_key='hub_os_financeiro') AS finance_module_exists,
 (SELECT count(*) FROM public.user_module_access
  WHERE module_key='hub_os_financeiro') AS finance_access_assignments,
 (SELECT count(*) FROM public.profiles
  WHERE role='admin' OR is_super_admin IS TRUE) AS administrator_profiles,
 (SELECT count(*) FROM public.profiles
  WHERE role='gerente' AND COALESCE(is_super_admin,false)=false) AS non_admin_managers,
 (SELECT md5(prosrc) FROM pg_proc
  WHERE oid='public.has_module_access(uuid,text)'::regprocedure)
    AS module_access_function_md5,
 to_regnamespace('evolusystem_finance_approval_private') IS NULL
    AS private_approver_schema_not_installed,
 to_regprocedure('public.can_approve_finance_correction()') IS NULL
    AS approval_eligibility_rpc_not_installed,
 (SELECT count(*) FROM public.os_finance_installments) AS finance_installments,
 (SELECT md5(prosrc) FROM pg_proc
  WHERE oid='public.finance_upsert_from_asset(uuid,uuid,text,date)'::regprocedure)
    AS finance_receipt_rpc_md5;
