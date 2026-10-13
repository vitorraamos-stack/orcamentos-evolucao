-- 19G SECURITY CHANGE: review-only until explicit authorization to apply.
-- The UI requires both hub_os and hub_os_kiosk for the official kiosk route.
DO $preflight$
DECLARE v_expected text[] := ARRAY[
 'os_kiosk_board_delete_authenticated', 'os_kiosk_board_insert_authenticated',
 'os_kiosk_board_select_authenticated', 'os_kiosk_board_update_authenticated'
];
BEGIN
  IF to_regclass('public.os_kiosk_board') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.os_kiosk_board'::regclass AND relrowsecurity)
     OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='os_kiosk_board') <> 4
     OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='os_kiosk_board' AND policyname = ANY(v_expected)) <> 4
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='os_kiosk_board'
                  AND (roles IS DISTINCT FROM ARRAY['authenticated']::name[]
                    OR (cmd IN ('SELECT','UPDATE','DELETE') AND qual IS DISTINCT FROM 'true')
                    OR (cmd IN ('INSERT','UPDATE') AND with_check IS DISTINCT FROM 'true')))
  THEN RAISE EXCEPTION '19G_ABORTED_KIOSK_POLICIES_CHANGED'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_module_access k
     JOIN public.user_module_access h ON h.user_id=k.user_id AND h.module_key='hub_os'
     WHERE k.module_key='hub_os_kiosk')
  THEN RAISE EXCEPTION '19G_ABORTED_NO_AUTHORIZED_KIOSK_USERS'; END IF;
  IF to_regprocedure('public.kiosk_board_cleanup_orphans_secure(text)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid='public.kiosk_board_cleanup_orphans_secure(text)'::regprocedure
                      AND p.prosecdef AND p.prosrc LIKE '%if auth.uid() is null then%'
                      )
  THEN RAISE EXCEPTION '19G_ABORTED_WRAPPER_CHANGED_KIOSK_BOARD_CLEANUP_ORPHANS_SECURE'; END IF;
  IF to_regprocedure('public.kiosk_board_complete_installation_secure(text,text,uuid,text)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid='public.kiosk_board_complete_installation_secure(text,text,uuid,text)'::regprocedure
                      AND p.prosecdef AND p.prosrc LIKE '%if auth.uid() is null then%'
                      AND p.prosrc LIKE '%coalesce(p_actor_id, auth.uid())%')
  THEN RAISE EXCEPTION '19G_ABORTED_WRAPPER_CHANGED_KIOSK_BOARD_COMPLETE_INSTALLATION_SECURE'; END IF;
  IF to_regprocedure('public.kiosk_board_move_secure(text,text,uuid,text)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid='public.kiosk_board_move_secure(text,text,uuid,text)'::regprocedure
                      AND p.prosecdef AND p.prosrc LIKE '%if auth.uid() is null then%'
                      AND p.prosrc LIKE '%coalesce(p_actor_id, auth.uid())%')
  THEN RAISE EXCEPTION '19G_ABORTED_WRAPPER_CHANGED_KIOSK_BOARD_MOVE_SECURE'; END IF;
  IF to_regprocedure('public.kiosk_board_register_by_code(text,uuid,text)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid='public.kiosk_board_register_by_code(text,uuid,text)'::regprocedure
                      AND p.prosecdef AND p.prosrc LIKE '%if auth.uid() is null then%'
                      AND p.prosrc LIKE '%coalesce(p_actor_id, auth.uid())%')
  THEN RAISE EXCEPTION '19G_ABORTED_WRAPPER_CHANGED_KIOSK_BOARD_REGISTER_BY_CODE'; END IF;
  IF to_regprocedure('public.kiosk_board_register_secure(text,uuid,text,uuid,text)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid='public.kiosk_board_register_secure(text,uuid,text,uuid,text)'::regprocedure
                      AND p.prosecdef AND p.prosrc LIKE '%if auth.uid() is null then%'
                      AND p.prosrc LIKE '%coalesce(p_actor_id, auth.uid())%')
  THEN RAISE EXCEPTION '19G_ABORTED_WRAPPER_CHANGED_KIOSK_BOARD_REGISTER_SECURE'; END IF;
END;
$preflight$;

-- Require kiosk module authorization for all CRUD operations.
DROP POLICY "os_kiosk_board_select_authenticated" ON public.os_kiosk_board;
DROP POLICY "os_kiosk_board_insert_authenticated" ON public.os_kiosk_board;
DROP POLICY "os_kiosk_board_update_authenticated" ON public.os_kiosk_board;
DROP POLICY "os_kiosk_board_delete_authenticated" ON public.os_kiosk_board;

CREATE POLICY "os_kiosk_board_select_authenticated" ON public.os_kiosk_board
 FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL
 AND public.has_module_access((select auth.uid()), 'hub_os')
 AND public.has_module_access((select auth.uid()), 'hub_os_kiosk'));
CREATE POLICY "os_kiosk_board_insert_authenticated" ON public.os_kiosk_board
 FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) IS NOT NULL
 AND public.has_module_access((select auth.uid()), 'hub_os')
 AND public.has_module_access((select auth.uid()), 'hub_os_kiosk'));
CREATE POLICY "os_kiosk_board_update_authenticated" ON public.os_kiosk_board
 FOR UPDATE TO authenticated USING ((select auth.uid()) IS NOT NULL
 AND public.has_module_access((select auth.uid()), 'hub_os')
 AND public.has_module_access((select auth.uid()), 'hub_os_kiosk')) WITH CHECK ((select auth.uid()) IS NOT NULL
 AND public.has_module_access((select auth.uid()), 'hub_os')
 AND public.has_module_access((select auth.uid()), 'hub_os_kiosk'));
CREATE POLICY "os_kiosk_board_delete_authenticated" ON public.os_kiosk_board
 FOR DELETE TO authenticated USING ((select auth.uid()) IS NOT NULL
 AND public.has_module_access((select auth.uid()), 'hub_os')
 AND public.has_module_access((select auth.uid()), 'hub_os_kiosk'));

-- Keep RPC signatures; add authorization and server-derived actor identity.
CREATE OR REPLACE FUNCTION public.kiosk_board_cleanup_orphans_secure(p_order_key text DEFAULT NULL::text)
 RETURNS TABLE(order_key text, removed boolean, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.'
      using errcode = 'P0001', detail = 'KIOSK_AUTH_REQUIRED';
  end if;

  IF NOT (public.has_module_access(auth.uid(), 'hub_os')
          AND public.has_module_access(auth.uid(), 'hub_os_kiosk')) THEN
    RAISE EXCEPTION 'Sem permissão para acessar o quiosque.'
      USING ERRCODE = '42501', DETAIL = 'KIOSK_MODULE_REQUIRED';
  END IF;

  return query
  select *
  from public.kiosk_board_cleanup_orphans(p_order_key);
end;
$function$;

CREATE OR REPLACE FUNCTION public.kiosk_board_complete_installation_secure(p_order_key text, p_feedback text, p_actor_id uuid DEFAULT NULL::uuid, p_terminal_id text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, order_key text, source_type text, source_id uuid, os_number bigint, sale_number text, client_name text, title text, description text, address text, delivery_date date, delivery_mode text, production_tag text, upstream_status text, current_stage text, material_ready boolean, terminal_id text, last_lookup_code text, created_by uuid, updated_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, removed boolean, result_code text, result_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.'
      using errcode = 'P0001', detail = 'KIOSK_AUTH_REQUIRED';
  end if;

  IF NOT (public.has_module_access(auth.uid(), 'hub_os')
          AND public.has_module_access(auth.uid(), 'hub_os_kiosk')) THEN
    RAISE EXCEPTION 'Sem permissão para acessar o quiosque.'
      USING ERRCODE = '42501', DETAIL = 'KIOSK_MODULE_REQUIRED';
  END IF;

  v_actor_id := auth.uid();

  return query
  select *
  from public.kiosk_board_complete_installation(
    p_order_key,
    p_feedback,
    v_actor_id,
    p_terminal_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.kiosk_board_move_secure(p_order_key text, p_action text, p_actor_id uuid DEFAULT NULL::uuid, p_terminal_id text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, order_key text, source_type text, source_id uuid, os_number bigint, sale_number text, client_name text, title text, description text, address text, delivery_date date, delivery_mode text, production_tag text, upstream_status text, current_stage text, material_ready boolean, terminal_id text, last_lookup_code text, created_by uuid, updated_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, removed boolean, result_code text, result_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.'
      using errcode = 'P0001', detail = 'KIOSK_AUTH_REQUIRED';
  end if;

  IF NOT (public.has_module_access(auth.uid(), 'hub_os')
          AND public.has_module_access(auth.uid(), 'hub_os_kiosk')) THEN
    RAISE EXCEPTION 'Sem permissão para acessar o quiosque.'
      USING ERRCODE = '42501', DETAIL = 'KIOSK_MODULE_REQUIRED';
  END IF;

  if p_action = 'remove_if_finalized' then
    raise exception 'Ação inválida para o quiosque.'
      using errcode = 'P0001', detail = 'KIOSK_INVALID_ACTION';
  end if;

  v_actor_id := auth.uid();

  return query
  select *
  from public.kiosk_board_move(
    p_order_key,
    p_action,
    v_actor_id,
    p_terminal_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.kiosk_board_register_by_code(p_lookup_code text, p_actor_id uuid DEFAULT NULL::uuid, p_terminal_id text DEFAULT NULL::text)
 RETURNS os_kiosk_board
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_code text;
  v_source_type text;
  v_source_id uuid;
  v_actor_id uuid;
  v_code_bigint bigint;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.'
      using errcode = 'P0001', detail = 'KIOSK_AUTH_REQUIRED';
  end if;

  IF NOT (public.has_module_access(auth.uid(), 'hub_os')
          AND public.has_module_access(auth.uid(), 'hub_os_kiosk')) THEN
    RAISE EXCEPTION 'Sem permissão para acessar o quiosque.'
      USING ERRCODE = '42501', DETAIL = 'KIOSK_MODULE_REQUIRED';
  END IF;

  v_code := regexp_replace(coalesce(p_lookup_code, ''), '\\D', '', 'g');

  if v_code = '' then
    raise exception 'Código inválido para consulta de OS.'
      using errcode = 'P0001', detail = 'KIOSK_INVALID_CODE';
  end if;

  begin
    v_code_bigint := v_code::bigint;
  exception
    when others then
      raise exception 'Código inválido para consulta de OS.'
        using errcode = 'P0001', detail = 'KIOSK_INVALID_CODE';
  end;

  -- legado: match forte por os_number, sale_number e title contendo o número isolado
  select 'os', o.id
    into v_source_type, v_source_id
  from public.os o
  where o.os_number = v_code_bigint
     or o.sale_number = v_code
     or regexp_replace(coalesce(o.sale_number, ''), '\\D', '', 'g') = v_code
     or coalesce(o.title, '') ~ ('(^|\\D)' || v_code || '(\\D|$)')
  order by o.updated_at desc nulls last
  limit 1;

  if not found then
    -- fluxo novo: incluir também os_number, além de sale_number e title
    select 'os_orders', oo.id
      into v_source_type, v_source_id
    from public.os_orders oo
    where oo.os_number = v_code_bigint
       or oo.sale_number = v_code
       or regexp_replace(coalesce(oo.sale_number, ''), '\\D', '', 'g') = v_code
       or coalesce(oo.title, '') ~ ('(^|\\D)' || v_code || '(\\D|$)')
    order by oo.updated_at desc nulls last
    limit 1;
  end if;

  if not found then
    raise exception 'OS não encontrada. Verifique o número da etiqueta.'
      using errcode = 'P0001', detail = 'KIOSK_UPSTREAM_NOT_FOUND';
  end if;

  v_actor_id := auth.uid();

  return public.kiosk_board_register(
    v_source_type,
    v_source_id,
    v_code,
    v_actor_id,
    p_terminal_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.kiosk_board_register_secure(p_source_type text, p_source_id uuid, p_lookup_code text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid, p_terminal_id text DEFAULT NULL::text)
 RETURNS os_kiosk_board
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.'
      using errcode = 'P0001', detail = 'KIOSK_AUTH_REQUIRED';
  end if;

  IF NOT (public.has_module_access(auth.uid(), 'hub_os')
          AND public.has_module_access(auth.uid(), 'hub_os_kiosk')) THEN
    RAISE EXCEPTION 'Sem permissão para acessar o quiosque.'
      USING ERRCODE = '42501', DETAIL = 'KIOSK_MODULE_REQUIRED';
  END IF;

  v_actor_id := auth.uid();

  return public.kiosk_board_register(
    p_source_type,
    p_source_id,
    p_lookup_code,
    v_actor_id,
    p_terminal_id
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.kiosk_board_cleanup_orphans_secure(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiosk_board_cleanup_orphans_secure(text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.kiosk_board_complete_installation_secure(text,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiosk_board_complete_installation_secure(text,text,uuid,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.kiosk_board_move_secure(text,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiosk_board_move_secure(text,text,uuid,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.kiosk_board_register_by_code(text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiosk_board_register_by_code(text,uuid,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.kiosk_board_register_secure(text,uuid,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiosk_board_register_secure(text,uuid,text,uuid,text) TO authenticated, service_role;

DO $postcheck$
BEGIN
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='os_kiosk_board') <> 4
 OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='os_kiosk_board'
   AND ((cmd IN ('SELECT','UPDATE','DELETE') AND (coalesce(qual,'') NOT LIKE '%hub_os%' OR coalesce(qual,'') NOT LIKE '%hub_os_kiosk%'))
   OR (cmd IN ('INSERT','UPDATE') AND (coalesce(with_check,'') NOT LIKE '%hub_os%' OR coalesce(with_check,'') NOT LIKE '%hub_os_kiosk%'))))
 THEN RAISE EXCEPTION '19G_ABORTED_RLS_POSTCONDITION'; END IF;
 IF has_function_privilege('anon','public.kiosk_board_cleanup_orphans_secure(text)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.kiosk_board_cleanup_orphans_secure(text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.kiosk_board_cleanup_orphans_secure(text)','EXECUTE')
 OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid='public.kiosk_board_cleanup_orphans_secure(text)'::regprocedure
  AND p.prosecdef AND p.prosrc LIKE '%KIOSK_MODULE_REQUIRED%'
  AND p.prosrc LIKE '%public.has_module_access(auth.uid(), ''hub_os'')%'
  AND p.prosrc LIKE '%public.has_module_access(auth.uid(), ''hub_os_kiosk'')%'
  )
 THEN RAISE EXCEPTION '19G_ABORTED_RPC_POSTCONDITION_KIOSK_BOARD_CLEANUP_ORPHANS_SECURE'; END IF;
 IF has_function_privilege('anon','public.kiosk_board_complete_installation_secure(text,text,uuid,text)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.kiosk_board_complete_installation_secure(text,text,uuid,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.kiosk_board_complete_installation_secure(text,text,uuid,text)','EXECUTE')
 OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid='public.kiosk_board_complete_installation_secure(text,text,uuid,text)'::regprocedure
  AND p.prosecdef AND p.prosrc LIKE '%KIOSK_MODULE_REQUIRED%'
  AND p.prosrc LIKE '%public.has_module_access(auth.uid(), ''hub_os'')%'
  AND p.prosrc LIKE '%public.has_module_access(auth.uid(), ''hub_os_kiosk'')%'
  AND p.prosrc NOT LIKE '%coalesce(p_actor_id, auth.uid())%' AND p.prosrc LIKE '%v_actor_id := auth.uid()%')
 THEN RAISE EXCEPTION '19G_ABORTED_RPC_POSTCONDITION_KIOSK_BOARD_COMPLETE_INSTALLATION_SECURE'; END IF;
 IF has_function_privilege('anon','public.kiosk_board_move_secure(text,text,uuid,text)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.kiosk_board_move_secure(text,text,uuid,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.kiosk_board_move_secure(text,text,uuid,text)','EXECUTE')
 OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid='public.kiosk_board_move_secure(text,text,uuid,text)'::regprocedure
  AND p.prosecdef AND p.prosrc LIKE '%KIOSK_MODULE_REQUIRED%'
  AND p.prosrc LIKE '%public.has_module_access(auth.uid(), ''hub_os'')%'
  AND p.prosrc LIKE '%public.has_module_access(auth.uid(), ''hub_os_kiosk'')%'
  AND p.prosrc NOT LIKE '%coalesce(p_actor_id, auth.uid())%' AND p.prosrc LIKE '%v_actor_id := auth.uid()%')
 THEN RAISE EXCEPTION '19G_ABORTED_RPC_POSTCONDITION_KIOSK_BOARD_MOVE_SECURE'; END IF;
 IF has_function_privilege('anon','public.kiosk_board_register_by_code(text,uuid,text)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.kiosk_board_register_by_code(text,uuid,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.kiosk_board_register_by_code(text,uuid,text)','EXECUTE')
 OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid='public.kiosk_board_register_by_code(text,uuid,text)'::regprocedure
  AND p.prosecdef AND p.prosrc LIKE '%KIOSK_MODULE_REQUIRED%'
  AND p.prosrc LIKE '%public.has_module_access(auth.uid(), ''hub_os'')%'
  AND p.prosrc LIKE '%public.has_module_access(auth.uid(), ''hub_os_kiosk'')%'
  AND p.prosrc NOT LIKE '%coalesce(p_actor_id, auth.uid())%' AND p.prosrc LIKE '%v_actor_id := auth.uid()%')
 THEN RAISE EXCEPTION '19G_ABORTED_RPC_POSTCONDITION_KIOSK_BOARD_REGISTER_BY_CODE'; END IF;
 IF has_function_privilege('anon','public.kiosk_board_register_secure(text,uuid,text,uuid,text)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.kiosk_board_register_secure(text,uuid,text,uuid,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.kiosk_board_register_secure(text,uuid,text,uuid,text)','EXECUTE')
 OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid='public.kiosk_board_register_secure(text,uuid,text,uuid,text)'::regprocedure
  AND p.prosecdef AND p.prosrc LIKE '%KIOSK_MODULE_REQUIRED%'
  AND p.prosrc LIKE '%public.has_module_access(auth.uid(), ''hub_os'')%'
  AND p.prosrc LIKE '%public.has_module_access(auth.uid(), ''hub_os_kiosk'')%'
  AND p.prosrc NOT LIKE '%coalesce(p_actor_id, auth.uid())%' AND p.prosrc LIKE '%v_actor_id := auth.uid()%')
 THEN RAISE EXCEPTION '19G_ABORTED_RPC_POSTCONDITION_KIOSK_BOARD_REGISTER_SECURE'; END IF;
END;
$postcheck$;
