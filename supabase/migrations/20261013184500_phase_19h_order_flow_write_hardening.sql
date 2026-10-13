-- 19H: Restrict direct flow-state writes and validate official order-flow mutations.
-- Review-only PR: apply to production only after explicit authorization.
-- No existing order, state row, or audit record is changed by this migration.
DO $preflight$
BEGIN
 IF to_regclass('public.hub_os_order_flow_state') IS NULL
    OR to_regclass('public.os_orders') IS NULL
    OR to_regclass('public.os') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid='public.hub_os_order_flow_state'::regclass AND c.relrowsecurity)
    OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='hub_os_order_flow_state') <> 3
    OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='hub_os_order_flow_state'
        AND policyname IN ('hub_os_order_flow_state_insert_authenticated','hub_os_order_flow_state_select_authenticated','hub_os_order_flow_state_update_authenticated')) <> 3
 THEN RAISE EXCEPTION '19H_ABORTED_TABLE_CONTRACT_CHANGED'; END IF;

 IF NOT has_table_privilege('authenticated','public.hub_os_order_flow_state','SELECT')
    OR NOT has_table_privilege('authenticated','public.hub_os_order_flow_state','INSERT')
    OR NOT has_table_privilege('authenticated','public.hub_os_order_flow_state','UPDATE')
    OR NOT has_table_privilege('service_role','public.hub_os_order_flow_state','INSERT')
 THEN RAISE EXCEPTION '19H_ABORTED_TABLE_GRANTS_CHANGED'; END IF;
 IF to_regprocedure('public.order_flow_list_secure()') IS NULL
 OR NOT EXISTS (SELECT 1 FROM pg_proc p
    WHERE p.oid='public.order_flow_list_secure()'::regprocedure
    AND p.prosecdef
    AND p.prosrc LIKE '%ORDER_FLOW_AUTH_REQUIRED%'
    )
 THEN RAISE EXCEPTION '19H_ABORTED_UNEXPECTED_RPC_ORDER_FLOW_LIST_SECURE'; END IF;
 IF to_regprocedure('public.order_flow_mark_retirado_secure(text,text,uuid)') IS NULL
 OR NOT EXISTS (SELECT 1 FROM pg_proc p
    WHERE p.oid='public.order_flow_mark_retirado_secure(text,text,uuid)'::regprocedure
    AND p.prosecdef
    AND p.prosrc LIKE '%ORDER_FLOW_AUTH_REQUIRED%'
    AND p.prosrc LIKE '%ORDER_FLOW_KEY_REQUIRED%' AND p.prosrc LIKE '%on conflict (order_key)%')
 THEN RAISE EXCEPTION '19H_ABORTED_UNEXPECTED_RPC_ORDER_FLOW_MARK_RETIRADO_SECURE'; END IF;
 IF to_regprocedure('public.order_flow_set_avisado_secure(text,text,uuid,boolean)') IS NULL
 OR NOT EXISTS (SELECT 1 FROM pg_proc p
    WHERE p.oid='public.order_flow_set_avisado_secure(text,text,uuid,boolean)'::regprocedure
    AND p.prosecdef
    AND p.prosrc LIKE '%ORDER_FLOW_AUTH_REQUIRED%'
    AND p.prosrc LIKE '%ORDER_FLOW_KEY_REQUIRED%' AND p.prosrc LIKE '%on conflict (order_key)%')
 THEN RAISE EXCEPTION '19H_ABORTED_UNEXPECTED_RPC_ORDER_FLOW_SET_AVISADO_SECURE'; END IF;
END;
$preflight$;

-- Production browser uses SECURITY DEFINER RPCs, not table mutations.
-- Keep the SELECT policy and grant needed for clients and Realtime.
DROP POLICY "hub_os_order_flow_state_insert_authenticated" ON public.hub_os_order_flow_state;
DROP POLICY "hub_os_order_flow_state_update_authenticated" ON public.hub_os_order_flow_state;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.hub_os_order_flow_state
 FROM PUBLIC, anon, authenticated;

-- Existing notifications and pickup logic are unchanged beyond identity validation.
CREATE OR REPLACE FUNCTION public.order_flow_mark_retirado_secure(p_order_key text, p_source_type text, p_source_id uuid)
 RETURNS hub_os_order_flow_state
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid;
  v_result public.hub_os_order_flow_state;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Usuário não autenticado.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_AUTH_REQUIRED';
  end if;

  if not public.has_module_access(v_actor_id, 'hub_os') then
    raise exception 'Você não tem permissão para alterar o fluxo global de OS.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_FORBIDDEN';
  end if;

  if p_source_type not in ('os', 'os_orders') then
    raise exception 'Fonte inválida para fluxo global.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_INVALID_SOURCE';
  end if;

  if coalesce(trim(p_order_key), '') = '' then
    raise exception 'Chave da OS é obrigatória.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_KEY_REQUIRED';
  end if;

  -- Validate canonical identity and real source before any write.
  IF p_source_id IS NULL OR p_order_key IS DISTINCT FROM p_source_type || ':' || p_source_id::text THEN
    RAISE EXCEPTION 'Identidade do pedido inconsistente.'
      USING ERRCODE = 'P0001', DETAIL = 'ORDER_FLOW_IDENTITY_MISMATCH';
  END IF;

  IF (p_source_type = 'os' AND NOT EXISTS (SELECT 1 FROM public.os WHERE id = p_source_id))
     OR (p_source_type = 'os_orders' AND NOT EXISTS (SELECT 1 FROM public.os_orders WHERE id = p_source_id)) THEN
    RAISE EXCEPTION 'Pedido original não encontrado.'
      USING ERRCODE = 'P0001', DETAIL = 'ORDER_FLOW_SOURCE_NOT_FOUND';
  END IF;


  insert into public.hub_os_order_flow_state (
    order_key,
    source_type,
    source_id,
    avisado_at,
    avisado_by,
    retirado_at,
    retirado_by
  ) values (
    p_order_key,
    p_source_type,
    p_source_id,
    null,
    null,
    now(),
    v_actor_id
  )
  on conflict (order_key)
  do update set
    source_type = excluded.source_type,
    source_id = excluded.source_id,
    avisado_at = null,
    avisado_by = null,
    retirado_at = coalesce(public.hub_os_order_flow_state.retirado_at, now()),
    retirado_by = coalesce(public.hub_os_order_flow_state.retirado_by, v_actor_id)
  returning * into v_result;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.order_flow_set_avisado_secure(p_order_key text, p_source_type text, p_source_id uuid, p_avisado boolean)
 RETURNS hub_os_order_flow_state
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid;
  v_result public.hub_os_order_flow_state;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Usuário não autenticado.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_AUTH_REQUIRED';
  end if;

  if not public.has_module_access(v_actor_id, 'hub_os') then
    raise exception 'Você não tem permissão para alterar o fluxo global de OS.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_FORBIDDEN';
  end if;

  if p_source_type not in ('os', 'os_orders') then
    raise exception 'Fonte inválida para fluxo global.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_INVALID_SOURCE';
  end if;

  if coalesce(trim(p_order_key), '') = '' then
    raise exception 'Chave da OS é obrigatória.'
      using errcode = 'P0001', detail = 'ORDER_FLOW_KEY_REQUIRED';
  end if;

  -- Validate canonical identity and real source before any write.
  IF p_source_id IS NULL OR p_order_key IS DISTINCT FROM p_source_type || ':' || p_source_id::text THEN
    RAISE EXCEPTION 'Identidade do pedido inconsistente.'
      USING ERRCODE = 'P0001', DETAIL = 'ORDER_FLOW_IDENTITY_MISMATCH';
  END IF;

  IF (p_source_type = 'os' AND NOT EXISTS (SELECT 1 FROM public.os WHERE id = p_source_id))
     OR (p_source_type = 'os_orders' AND NOT EXISTS (SELECT 1 FROM public.os_orders WHERE id = p_source_id)) THEN
    RAISE EXCEPTION 'Pedido original não encontrado.'
      USING ERRCODE = 'P0001', DETAIL = 'ORDER_FLOW_SOURCE_NOT_FOUND';
  END IF;


  insert into public.hub_os_order_flow_state (
    order_key,
    source_type,
    source_id,
    avisado_at,
    avisado_by,
    retirado_at,
    retirado_by
  ) values (
    p_order_key,
    p_source_type,
    p_source_id,
    case when p_avisado then now() else null end,
    case when p_avisado then v_actor_id else null end,
    null,
    null
  )
  on conflict (order_key)
  do update set
    source_type = excluded.source_type,
    source_id = excluded.source_id,
    avisado_at = case when p_avisado then now() else null end,
    avisado_by = case when p_avisado then v_actor_id else null end,
    retirado_at = case when p_avisado then null else public.hub_os_order_flow_state.retirado_at end,
    retirado_by = case when p_avisado then null else public.hub_os_order_flow_state.retirado_by end
  returning * into v_result;

  return v_result;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.order_flow_list_secure() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_flow_list_secure() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.order_flow_mark_retirado_secure(text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_flow_mark_retirado_secure(text,text,uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.order_flow_set_avisado_secure(text,text,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_flow_set_avisado_secure(text,text,uuid,boolean) TO authenticated, service_role;

DO $postcheck$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid='public.hub_os_order_flow_state'::regclass AND c.relrowsecurity)
    OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='hub_os_order_flow_state') <> 1
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hub_os_order_flow_state'
        AND policyname='hub_os_order_flow_state_select_authenticated' AND cmd='SELECT')
    OR has_table_privilege('anon','public.hub_os_order_flow_state','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_table_privilege('authenticated','public.hub_os_order_flow_state','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR NOT has_table_privilege('authenticated','public.hub_os_order_flow_state','SELECT')
    OR NOT has_table_privilege('service_role','public.hub_os_order_flow_state','SELECT,INSERT,UPDATE,DELETE')
 THEN RAISE EXCEPTION '19H_ABORTED_TABLE_POSTCONDITION'; END IF;
 IF has_function_privilege('anon','public.order_flow_list_secure()','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.order_flow_list_secure()','EXECUTE')
    OR NOT has_function_privilege('service_role','public.order_flow_list_secure()','EXECUTE')
    
 THEN RAISE EXCEPTION '19H_ABORTED_RPC_POSTCONDITION_ORDER_FLOW_LIST_SECURE'; END IF;
 IF has_function_privilege('anon','public.order_flow_mark_retirado_secure(text,text,uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.order_flow_mark_retirado_secure(text,text,uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.order_flow_mark_retirado_secure(text,text,uuid)','EXECUTE')
    OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid='public.order_flow_mark_retirado_secure(text,text,uuid)'::regprocedure
        AND p.prosecdef AND p.prosrc LIKE '%ORDER_FLOW_IDENTITY_MISMATCH%'
        AND p.prosrc LIKE '%ORDER_FLOW_SOURCE_NOT_FOUND%')
 THEN RAISE EXCEPTION '19H_ABORTED_RPC_POSTCONDITION_ORDER_FLOW_MARK_RETIRADO_SECURE'; END IF;
 IF has_function_privilege('anon','public.order_flow_set_avisado_secure(text,text,uuid,boolean)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.order_flow_set_avisado_secure(text,text,uuid,boolean)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.order_flow_set_avisado_secure(text,text,uuid,boolean)','EXECUTE')
    OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid='public.order_flow_set_avisado_secure(text,text,uuid,boolean)'::regprocedure
        AND p.prosecdef AND p.prosrc LIKE '%ORDER_FLOW_IDENTITY_MISMATCH%'
        AND p.prosrc LIKE '%ORDER_FLOW_SOURCE_NOT_FOUND%')
 THEN RAISE EXCEPTION '19H_ABORTED_RPC_POSTCONDITION_ORDER_FLOW_SET_AVISADO_SECURE'; END IF;
END;
$postcheck$;
