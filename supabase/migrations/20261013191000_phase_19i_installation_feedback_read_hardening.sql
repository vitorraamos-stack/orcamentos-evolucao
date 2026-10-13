-- Phase 19I: Restrict direct installation feedback reads to authorized Hub OS managers.
-- Proposal only: apply to production only after explicit database authorization.
-- No modification of existing feedbacks, orders or installation data.

DO $preflight$
BEGIN
  IF to_regclass('public.os_installation_feedbacks') IS NULL
    OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.os_installation_feedbacks'::regclass AND relrowsecurity)
    OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='os_installation_feedbacks') <> 4
    OR NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname='public' AND tablename='os_installation_feedbacks'
         AND policyname='os_installation_feedbacks_select_authenticated'
         AND cmd='SELECT' AND roles=ARRAY['authenticated']::name[]
         AND qual='true'
    )
  THEN RAISE EXCEPTION '19I_ABORTED_FEEDBACK_TABLE_POLICY_CHANGED'; END IF;

  IF NOT has_table_privilege('authenticated','public.os_installation_feedbacks','SELECT')
     OR NOT has_table_privilege('service_role','public.os_installation_feedbacks','SELECT')
     OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE public.is_admin(p.id)
                    AND public.has_module_access(p.id,'hub_os'))
  THEN RAISE EXCEPTION '19I_ABORTED_FEEDBACK_ACCESS_CONTRACT_CHANGED'; END IF;

  IF to_regprocedure('public.installation_feedback_mark_reviewed_secure(uuid)') IS NULL OR NOT EXISTS (
     SELECT 1 FROM pg_proc p
     WHERE p.oid='public.installation_feedback_mark_reviewed_secure(uuid)'::regprocedure
       AND p.prosecdef
       AND p.prosrc LIKE '%KIOSK_AUTH_REQUIRED%'
       AND p.prosrc LIKE '%KIOSK_MANAGER_REQUIRED%'
       AND p.prosrc NOT LIKE '%INSTALLATION_FEEDBACK_HUB_MODULE_REQUIRED%'
       AND has_function_privilege('authenticated',p.oid,'EXECUTE')
  ) THEN RAISE EXCEPTION '19I_ABORTED_UNEXPECTED_RPC_INSTALLATION_FEEDBACK_MARK_REVIEWED_SECURE'; END IF;

  IF to_regprocedure('public.installation_feedbacks_list_secure()') IS NULL OR NOT EXISTS (
     SELECT 1 FROM pg_proc p
     WHERE p.oid='public.installation_feedbacks_list_secure()'::regprocedure
       AND p.prosecdef
       AND p.prosrc LIKE '%KIOSK_AUTH_REQUIRED%'
       AND p.prosrc LIKE '%KIOSK_MANAGER_REQUIRED%'
       AND p.prosrc NOT LIKE '%INSTALLATION_FEEDBACK_HUB_MODULE_REQUIRED%'
       AND has_function_privilege('authenticated',p.oid,'EXECUTE')
  ) THEN RAISE EXCEPTION '19I_ABORTED_UNEXPECTED_RPC_INSTALLATION_FEEDBACKS_LIST_SECURE'; END IF;
END;
$preflight$;

-- Replace the permissive authenticated SELECT policy without touching any feedback row.
DROP POLICY "os_installation_feedbacks_select_authenticated" ON public.os_installation_feedbacks;
CREATE POLICY "os_installation_feedbacks_select_authenticated"
 ON public.os_installation_feedbacks FOR SELECT TO authenticated
 USING (
    (select auth.uid()) IS NOT NULL
    AND public.is_admin((select auth.uid()))
    AND public.has_module_access((select auth.uid()), 'hub_os')
 );

-- Keep manager-only feedback RPC semantics, now also requiring the Hub OS module.
CREATE OR REPLACE FUNCTION public.installation_feedback_mark_reviewed_secure(p_feedback_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'Usuário não autenticado.'
      using errcode = 'P0001', detail = 'KIOSK_AUTH_REQUIRED';
  end if;

  if not public.is_admin(v_actor_id) then
    raise exception 'Sem permissão para revisar feedbacks de instalação.'
      using errcode = 'P0001', detail = 'KIOSK_MANAGER_REQUIRED';
  end if;

  -- Align direct API access and privileged RPC checks with the Hub OS screen.
  IF NOT public.has_module_access(auth.uid(), 'hub_os') THEN
    RAISE EXCEPTION 'Sem acesso ao módulo Hub OS para feedbacks de instalação.'
      USING ERRCODE = '42501', DETAIL = 'INSTALLATION_FEEDBACK_HUB_MODULE_REQUIRED';
  END IF;

  update public.os_installation_feedbacks
  set
    reviewed = true,
    reviewed_at = coalesce(reviewed_at, now()),
    reviewed_by = coalesce(reviewed_by, v_actor_id)
  where id = p_feedback_id;

  if not found then
    raise exception 'Feedback de instalação não encontrado.'
      using errcode = 'P0001', detail = 'INSTALLATION_FEEDBACK_NOT_FOUND';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.installation_feedbacks_list_secure()
 RETURNS TABLE(id uuid, order_key text, source_type text, source_id uuid, os_number bigint, sale_number text, client_name text, title text, feedback text, created_by uuid, created_at timestamp with time zone, finalized_at timestamp with time zone, reviewed boolean, reviewed_at timestamp with time zone, reviewed_by uuid, reviewed_by_email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.'
      using errcode = 'P0001', detail = 'KIOSK_AUTH_REQUIRED';
  end if;

  if not public.is_admin(auth.uid()) then
    raise exception 'Sem permissão para consultar feedbacks de instalação.'
      using errcode = 'P0001', detail = 'KIOSK_MANAGER_REQUIRED';
  end if;

  -- Align direct API access and privileged RPC checks with the Hub OS screen.
  IF NOT public.has_module_access(auth.uid(), 'hub_os') THEN
    RAISE EXCEPTION 'Sem acesso ao módulo Hub OS para feedbacks de instalação.'
      USING ERRCODE = '42501', DETAIL = 'INSTALLATION_FEEDBACK_HUB_MODULE_REQUIRED';
  END IF;

  return query
  select
    f.id,
    f.order_key,
    f.source_type,
    f.source_id,
    f.os_number,
    f.sale_number,
    f.client_name,
    f.title,
    f.feedback,
    f.created_by,
    f.created_at,
    f.finalized_at,
    f.reviewed,
    f.reviewed_at,
    f.reviewed_by,
    p.email as reviewed_by_email
  from public.os_installation_feedbacks f
  left join public.profiles p on p.id = f.reviewed_by
  order by f.created_at desc;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.installation_feedback_mark_reviewed_secure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.installation_feedback_mark_reviewed_secure(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.installation_feedbacks_list_secure() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.installation_feedbacks_list_secure() TO authenticated, service_role;

DO $postcheck$
BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='os_installation_feedbacks') <> 4
     OR NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='public' AND tablename='os_installation_feedbacks'
          AND policyname='os_installation_feedbacks_select_authenticated'
          AND cmd='SELECT' AND roles=ARRAY['authenticated']::name[]
          AND qual LIKE '%is_admin%'
          AND qual LIKE '%has_module_access%'
          AND qual LIKE '%hub_os%'
     )
     OR NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='public' AND tablename='os_installation_feedbacks'
          AND cmd='INSERT' AND with_check='false'
     )
     OR NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='public' AND tablename='os_installation_feedbacks'
          AND cmd='UPDATE' AND qual='false' AND with_check='false'
     )
     OR NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='public' AND tablename='os_installation_feedbacks'
          AND cmd='DELETE' AND qual='false'
     )
  THEN RAISE EXCEPTION '19I_ABORTED_FEEDBACK_RLS_POSTCONDITION'; END IF;
  IF has_function_privilege('anon','public.installation_feedback_mark_reviewed_secure(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.installation_feedback_mark_reviewed_secure(uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.installation_feedback_mark_reviewed_secure(uuid)','EXECUTE')
     OR NOT EXISTS(
       SELECT 1 FROM pg_proc p WHERE p.oid='public.installation_feedback_mark_reviewed_secure(uuid)'::regprocedure
         AND p.prosecdef
         AND p.prosrc LIKE '%KIOSK_MANAGER_REQUIRED%'
         AND p.prosrc LIKE '%INSTALLATION_FEEDBACK_HUB_MODULE_REQUIRED%'
     )
  THEN RAISE EXCEPTION '19I_ABORTED_RPC_POSTCONDITION_INSTALLATION_FEEDBACK_MARK_REVIEWED_SECURE'; END IF;
  IF has_function_privilege('anon','public.installation_feedbacks_list_secure()','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.installation_feedbacks_list_secure()','EXECUTE')
     OR NOT has_function_privilege('service_role','public.installation_feedbacks_list_secure()','EXECUTE')
     OR NOT EXISTS(
       SELECT 1 FROM pg_proc p WHERE p.oid='public.installation_feedbacks_list_secure()'::regprocedure
         AND p.prosecdef
         AND p.prosrc LIKE '%KIOSK_MANAGER_REQUIRED%'
         AND p.prosrc LIKE '%INSTALLATION_FEEDBACK_HUB_MODULE_REQUIRED%'
     )
  THEN RAISE EXCEPTION '19I_ABORTED_RPC_POSTCONDITION_INSTALLATION_FEEDBACKS_LIST_SECURE'; END IF;
END;
$postcheck$;
