-- EvoluSystem: Finance correction approvers — REVIEW-ONLY CANDIDATE.
-- NOT APPLIED. Separate decision/approval/execution RPCs NOT implemented.
-- Goal: administrators or explicitly authorized finance approvers only.
-- IMPORTANT public.is_admin() includes gerente; do NOT rely on it.

DO $preflight$
BEGIN
 IF current_user <> 'postgres' THEN
  RAISE EXCEPTION 'FIN_CORR_AUTH_EXECUTOR_DRIFT' USING ERRCODE='42501';
 END IF;
 IF to_regnamespace('evolusystem_finance_approval_private') IS NOT NULL
    OR to_regprocedure('public.can_approve_finance_correction()') IS NOT NULL
 THEN
  RAISE EXCEPTION 'FIN_CORR_AUTH_OBJECT_ALREADY_EXISTS' USING ERRCODE='55000';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='profiles'
    AND column_name='is_super_admin' AND data_type='boolean'
 ) OR NOT EXISTS (
   SELECT 1 FROM public.app_modules WHERE module_key='hub_os_financeiro'
 ) OR NOT EXISTS (
   SELECT 1 FROM pg_proc p
   WHERE p.oid='public.has_module_access(uuid,text)'::regprocedure
     AND p.prosecdef
     AND pg_get_userbyid(p.proowner)='postgres'
     AND md5(p.prosrc)='5855f6a54a28a3f37f3c2702a5b0ac82'
 ) THEN
  RAISE EXCEPTION 'FIN_CORR_AUTH_DEPENDENCY_DRIFT' USING ERRCODE='55000';
 END IF;
END;
$preflight$;

-- Private schema: MUST NOT be added to Supabase Data API Exposed Schemas.
CREATE SCHEMA evolusystem_finance_approval_private;
REVOKE ALL ON SCHEMA evolusystem_finance_approval_private
 FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA evolusystem_finance_approval_private
 TO service_role;

CREATE TABLE evolusystem_finance_approval_private.finance_correction_approvers (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 granted_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 CONSTRAINT approver_revocation_after_grant CHECK (
   revoked_at IS NULL OR revoked_at >= granted_at
 )
);
ALTER TABLE evolusystem_finance_approval_private.finance_correction_approvers
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE
 evolusystem_finance_approval_private.finance_correction_approvers
 FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE
 evolusystem_finance_approval_private.finance_correction_approvers
 TO service_role;

-- Caller-only check. No parameter for testing another user's privileges.
CREATE FUNCTION public.can_approve_finance_correction()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
 SELECT EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id=auth.uid()
    AND (
      p.role='admin'
      OR p.is_super_admin IS TRUE
      OR (
        public.has_module_access(auth.uid(),'hub_os_financeiro')
        AND EXISTS (
          SELECT 1
          FROM evolusystem_finance_approval_private.finance_correction_approvers a
          WHERE a.user_id=auth.uid() AND a.revoked_at IS NULL
        )
      )
    )
 );
$function$;
REVOKE ALL ON FUNCTION public.can_approve_finance_correction()
 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_approve_finance_correction()
 TO authenticated, service_role;

DO $postcheck$
BEGIN
 IF has_schema_privilege('authenticated','evolusystem_finance_approval_private','USAGE')
    OR has_schema_privilege('anon','evolusystem_finance_approval_private','USAGE')
    OR NOT has_schema_privilege('service_role','evolusystem_finance_approval_private','USAGE')
    OR has_table_privilege('authenticated',
      'evolusystem_finance_approval_private.finance_correction_approvers','SELECT')
    OR has_table_privilege('anon',
      'evolusystem_finance_approval_private.finance_correction_approvers','SELECT')
    OR NOT (
       SELECT c.relrowsecurity
       FROM pg_class c
       WHERE c.oid='evolusystem_finance_approval_private.finance_correction_approvers'::regclass
    )
    OR has_function_privilege('anon','public.can_approve_finance_correction()','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.can_approve_finance_correction()','EXECUTE')
 THEN
  RAISE EXCEPTION 'FIN_CORR_AUTH_POSTCHECK_FAILED' USING ERRCODE='55000';
 END IF;
END;
$postcheck$;

-- This candidate creates NO approval request or finance mutation routine.
-- Eligibility alone MUST NOT authorize direct updates to installments.
