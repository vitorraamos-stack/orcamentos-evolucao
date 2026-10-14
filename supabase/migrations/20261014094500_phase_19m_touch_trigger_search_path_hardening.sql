-- Phase 19M: fix mutable search_path on five simple timestamp trigger functions.
-- PROPOSAL ONLY: do not apply to production or merge without separate explicit approvals.
-- No function implementation, privilege, trigger, RLS policy, or business data changes.
-- PostgreSQL resolves pg_catalog built-ins (now) implicitly with an empty search_path;
-- auth.uid() is explicitly schema-qualified where used.

DO $preflight$
BEGIN
  IF to_regprocedure('public.hub_os_order_flow_state_touch_updated_at()') IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.oid='public.hub_os_order_flow_state_touch_updated_at()'::regprocedure
      AND n.nspname='public'
      AND pg_get_userbyid(p.proowner)='postgres'
      AND p.prorettype='trigger'::regtype
      AND NOT p.prosecdef
      AND p.proconfig IS NULL
      AND md5(p.prosrc)='608ef48381668ad5cc300914a52c93f5'
  ) OR (SELECT count(*) FROM pg_trigger t WHERE t.tgfoid='public.hub_os_order_flow_state_touch_updated_at()'::regprocedure AND NOT t.tgisinternal) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgfoid='public.hub_os_order_flow_state_touch_updated_at()'::regprocedure
        AND t.tgname='hub_os_order_flow_state_touch_updated_at_trg'
        AND t.tgrelid='public.hub_os_order_flow_state'::regclass
        AND t.tgenabled='O'
        AND NOT t.tgisinternal
        AND pg_get_triggerdef(t.oid,true) LIKE '%BEFORE UPDATE ON%'
    )
  THEN
    RAISE EXCEPTION '19M_ABORTED_PRECONDITION_HUB_OS_ORDER_FLOW_STATE_TOUCH_UPDATED_AT';
  END IF;

  IF to_regprocedure('public.os_kiosk_board_touch_updated_at()') IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.oid='public.os_kiosk_board_touch_updated_at()'::regprocedure
      AND n.nspname='public'
      AND pg_get_userbyid(p.proowner)='postgres'
      AND p.prorettype='trigger'::regtype
      AND NOT p.prosecdef
      AND p.proconfig IS NULL
      AND md5(p.prosrc)='608ef48381668ad5cc300914a52c93f5'
  ) OR (SELECT count(*) FROM pg_trigger t WHERE t.tgfoid='public.os_kiosk_board_touch_updated_at()'::regprocedure AND NOT t.tgisinternal) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgfoid='public.os_kiosk_board_touch_updated_at()'::regprocedure
        AND t.tgname='os_kiosk_board_touch_updated_at_trg'
        AND t.tgrelid='public.os_kiosk_board'::regclass
        AND t.tgenabled='O'
        AND NOT t.tgisinternal
        AND pg_get_triggerdef(t.oid,true) LIKE '%BEFORE UPDATE ON%'
    )
  THEN
    RAISE EXCEPTION '19M_ABORTED_PRECONDITION_OS_KIOSK_BOARD_TOUCH_UPDATED_AT';
  END IF;

  IF to_regprocedure('public.set_os_orders_updated_at()') IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.oid='public.set_os_orders_updated_at()'::regprocedure
      AND n.nspname='public'
      AND pg_get_userbyid(p.proowner)='postgres'
      AND p.prorettype='trigger'::regtype
      AND NOT p.prosecdef
      AND p.proconfig IS NULL
      AND md5(p.prosrc)='0c35a013f9fab2ad61698db68776b8eb'
  ) OR (SELECT count(*) FROM pg_trigger t WHERE t.tgfoid='public.set_os_orders_updated_at()'::regprocedure AND NOT t.tgisinternal) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgfoid='public.set_os_orders_updated_at()'::regprocedure
        AND t.tgname='os_orders_set_updated_at'
        AND t.tgrelid='public.os_orders'::regclass
        AND t.tgenabled='O'
        AND NOT t.tgisinternal
        AND pg_get_triggerdef(t.oid,true) LIKE '%BEFORE UPDATE ON%'
    )
  THEN
    RAISE EXCEPTION '19M_ABORTED_PRECONDITION_SET_OS_ORDERS_UPDATED_AT';
  END IF;

  IF to_regprocedure('public.set_portfolio_photos_updated_at()') IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.oid='public.set_portfolio_photos_updated_at()'::regprocedure
      AND n.nspname='public'
      AND pg_get_userbyid(p.proowner)='postgres'
      AND p.prorettype='trigger'::regtype
      AND NOT p.prosecdef
      AND p.proconfig IS NULL
      AND md5(p.prosrc)='204b9b9355e61b7541bc0633bbc9294c'
  ) OR (SELECT count(*) FROM pg_trigger t WHERE t.tgfoid='public.set_portfolio_photos_updated_at()'::regprocedure AND NOT t.tgisinternal) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgfoid='public.set_portfolio_photos_updated_at()'::regprocedure
        AND t.tgname='portfolio_photos_set_updated_at'
        AND t.tgrelid='public.portfolio_photos'::regclass
        AND t.tgenabled='O'
        AND NOT t.tgisinternal
        AND pg_get_triggerdef(t.oid,true) LIKE '%BEFORE UPDATE ON%'
    )
  THEN
    RAISE EXCEPTION '19M_ABORTED_PRECONDITION_SET_PORTFOLIO_PHOTOS_UPDATED_AT';
  END IF;

  IF to_regprocedure('public.set_updated_at_timestamp()') IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.oid='public.set_updated_at_timestamp()'::regprocedure
      AND n.nspname='public'
      AND pg_get_userbyid(p.proowner)='postgres'
      AND p.prorettype='trigger'::regtype
      AND NOT p.prosecdef
      AND p.proconfig IS NULL
      AND md5(p.prosrc)='204b9b9355e61b7541bc0633bbc9294c'
  ) OR (SELECT count(*) FROM pg_trigger t WHERE t.tgfoid='public.set_updated_at_timestamp()'::regprocedure AND NOT t.tgisinternal) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgfoid='public.set_updated_at_timestamp()'::regprocedure
        AND t.tgname='os_order_asset_jobs_set_updated_at'
        AND t.tgrelid='public.os_order_asset_jobs'::regclass
        AND t.tgenabled='O'
        AND NOT t.tgisinternal
        AND pg_get_triggerdef(t.oid,true) LIKE '%BEFORE UPDATE ON%'
    )
  THEN
    RAISE EXCEPTION '19M_ABORTED_PRECONDITION_SET_UPDATED_AT_TIMESTAMP';
  END IF;

END;
$preflight$;

-- Pin only function execution context. Preserve each function body and trigger.
ALTER FUNCTION public.hub_os_order_flow_state_touch_updated_at() SET search_path TO '';

ALTER FUNCTION public.os_kiosk_board_touch_updated_at() SET search_path TO '';

ALTER FUNCTION public.set_os_orders_updated_at() SET search_path TO '';

ALTER FUNCTION public.set_portfolio_photos_updated_at() SET search_path TO '';

ALTER FUNCTION public.set_updated_at_timestamp() SET search_path TO '';

DO $postcheck$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p WHERE p.oid='public.hub_os_order_flow_state_touch_updated_at()'::regprocedure
      AND p.prorettype='trigger'::regtype
      AND NOT p.prosecdef
      AND md5(p.prosrc)='608ef48381668ad5cc300914a52c93f5'
      AND p.proconfig @> ARRAY['search_path=""']::text[]
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgfoid='public.hub_os_order_flow_state_touch_updated_at()'::regprocedure
      AND t.tgname='hub_os_order_flow_state_touch_updated_at_trg'
      AND t.tgrelid='public.hub_os_order_flow_state'::regclass
      AND t.tgenabled='O'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION '19M_ABORTED_POSTCONDITION_HUB_OS_ORDER_FLOW_STATE_TOUCH_UPDATED_AT';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p WHERE p.oid='public.os_kiosk_board_touch_updated_at()'::regprocedure
      AND p.prorettype='trigger'::regtype
      AND NOT p.prosecdef
      AND md5(p.prosrc)='608ef48381668ad5cc300914a52c93f5'
      AND p.proconfig @> ARRAY['search_path=""']::text[]
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgfoid='public.os_kiosk_board_touch_updated_at()'::regprocedure
      AND t.tgname='os_kiosk_board_touch_updated_at_trg'
      AND t.tgrelid='public.os_kiosk_board'::regclass
      AND t.tgenabled='O'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION '19M_ABORTED_POSTCONDITION_OS_KIOSK_BOARD_TOUCH_UPDATED_AT';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p WHERE p.oid='public.set_os_orders_updated_at()'::regprocedure
      AND p.prorettype='trigger'::regtype
      AND NOT p.prosecdef
      AND md5(p.prosrc)='0c35a013f9fab2ad61698db68776b8eb'
      AND p.proconfig @> ARRAY['search_path=""']::text[]
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgfoid='public.set_os_orders_updated_at()'::regprocedure
      AND t.tgname='os_orders_set_updated_at'
      AND t.tgrelid='public.os_orders'::regclass
      AND t.tgenabled='O'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION '19M_ABORTED_POSTCONDITION_SET_OS_ORDERS_UPDATED_AT';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p WHERE p.oid='public.set_portfolio_photos_updated_at()'::regprocedure
      AND p.prorettype='trigger'::regtype
      AND NOT p.prosecdef
      AND md5(p.prosrc)='204b9b9355e61b7541bc0633bbc9294c'
      AND p.proconfig @> ARRAY['search_path=""']::text[]
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgfoid='public.set_portfolio_photos_updated_at()'::regprocedure
      AND t.tgname='portfolio_photos_set_updated_at'
      AND t.tgrelid='public.portfolio_photos'::regclass
      AND t.tgenabled='O'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION '19M_ABORTED_POSTCONDITION_SET_PORTFOLIO_PHOTOS_UPDATED_AT';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p WHERE p.oid='public.set_updated_at_timestamp()'::regprocedure
      AND p.prorettype='trigger'::regtype
      AND NOT p.prosecdef
      AND md5(p.prosrc)='204b9b9355e61b7541bc0633bbc9294c'
      AND p.proconfig @> ARRAY['search_path=""']::text[]
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgfoid='public.set_updated_at_timestamp()'::regprocedure
      AND t.tgname='os_order_asset_jobs_set_updated_at'
      AND t.tgrelid='public.os_order_asset_jobs'::regclass
      AND t.tgenabled='O'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION '19M_ABORTED_POSTCONDITION_SET_UPDATED_AT_TIMESTAMP';
  END IF;

END;
$postcheck$;
