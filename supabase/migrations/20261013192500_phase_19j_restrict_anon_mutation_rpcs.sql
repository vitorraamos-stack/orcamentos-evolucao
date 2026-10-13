-- 19J: close anonymous EXECUTE on two authenticated business-mutation RPCs.
-- Proposal only: do not apply to production until database authorization.
-- No changes to the function bodies, signatures, business roles, orders, materials, tiers or events.

DO $preflight$
BEGIN
  IF to_regprocedure('public.update_os_order_consultor(uuid,jsonb)') IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.update_os_order_consultor(uuid,jsonb)'::regprocedure
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND has_function_privilege('service_role', p.oid, 'EXECUTE')
      AND p.prosrc LIKE '%has_module_access(v_uid, ''hub_os'')%'
      AND p.prosrc LIKE '%v_uid uuid := auth.uid()%'
  ) THEN
    RAISE EXCEPTION '19J_ABORTED_UNEXPECTED_RPC_UPDATE_OS_ORDER_CONSULTOR';
  END IF;

  IF to_regprocedure('public.upsert_material_with_tiers(uuid,text,text,text,text,numeric,text,jsonb)') IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.upsert_material_with_tiers(uuid,text,text,text,text,numeric,text,jsonb)'::regprocedure
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND has_function_privilege('service_role', p.oid, 'EXECUTE')
      AND p.prosrc LIKE '%public.is_manager(v_uid)%'
      AND p.prosrc LIKE '%v_uid uuid := auth.uid()%'
  ) THEN
    RAISE EXCEPTION '19J_ABORTED_UNEXPECTED_RPC_UPSERT_MATERIAL_WITH_TIERS';
  END IF;
END;
$preflight$;

-- These SECURITY DEFINER RPCs are intended for signed-in browser sessions only.
REVOKE EXECUTE ON FUNCTION public.update_os_order_consultor(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_os_order_consultor(uuid,jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.upsert_material_with_tiers(uuid,text,text,text,text,numeric,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_material_with_tiers(uuid,text,text,text,text,numeric,text,jsonb) TO authenticated, service_role;

-- Assert least privilege while preserving the same definer function bodies.
DO $postcheck$
BEGIN
  IF has_function_privilege('anon', 'public.update_os_order_consultor(uuid,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.update_os_order_consultor(uuid,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.update_os_order_consultor(uuid,jsonb)', 'EXECUTE')
    OR NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = 'public.update_os_order_consultor(uuid,jsonb)'::regprocedure
        AND p.prosecdef
        AND p.prosrc LIKE '%has_module_access(v_uid, ''hub_os'')%'
        AND p.prosrc LIKE '%v_uid uuid := auth.uid()%'
    )
  THEN
    RAISE EXCEPTION '19J_ABORTED_RPC_POSTCONDITION_UPDATE_OS_ORDER_CONSULTOR';
  END IF;

  IF has_function_privilege('anon', 'public.upsert_material_with_tiers(uuid,text,text,text,text,numeric,text,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.upsert_material_with_tiers(uuid,text,text,text,text,numeric,text,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.upsert_material_with_tiers(uuid,text,text,text,text,numeric,text,jsonb)', 'EXECUTE')
    OR NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = 'public.upsert_material_with_tiers(uuid,text,text,text,text,numeric,text,jsonb)'::regprocedure
        AND p.prosecdef
        AND p.prosrc LIKE '%public.is_manager(v_uid)%'
        AND p.prosrc LIKE '%v_uid uuid := auth.uid()%'
    )
  THEN
    RAISE EXCEPTION '19J_ABORTED_RPC_POSTCONDITION_UPSERT_MATERIAL_WITH_TIERS';
  END IF;

END;
$postcheck$;
