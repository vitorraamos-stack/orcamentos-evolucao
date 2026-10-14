-- Phase 19N: pin empty search_path for six legacy SECURITY INVOKER kiosk functions.
-- PROPOSAL ONLY: requires separate authorization to apply migration and later to merge.
-- Does not change bodies, role grants, RLS policies, tables, or operational data.
-- All database relations are schema-qualified in the original bodies; built-ins resolve
-- in pg_catalog, which PostgreSQL implicitly searches when search_path is empty.
-- PostgreSQL represents the quoted empty path in pg_proc.proconfig as search_path="".

DO $preflight$
BEGIN
  IF to_regprocedure('public.kiosk_board_cleanup_orphans(text)') IS NULL OR NOT EXISTS (
    SELECT 1
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE p.oid='public.kiosk_board_cleanup_orphans(text)'::regprocedure
       AND n.nspname='public'
       AND pg_get_userbyid(p.proowner)='postgres'
       AND NOT p.prosecdef
       AND p.prorettype='record'::regtype
       AND p.proconfig IS NULL
       AND md5(p.prosrc)='8c0c40661ffcf23390f304a488873845'
       AND has_function_privilege('anon',p.oid,'EXECUTE')
       AND has_function_privilege('authenticated',p.oid,'EXECUTE')
       AND has_function_privilege('service_role',p.oid,'EXECUTE')
  )
  THEN RAISE EXCEPTION '19N_ABORTED_PRECONDITION_KIOSK_BOARD_CLEANUP_ORPHANS'; END IF;

  IF to_regprocedure('public.kiosk_board_complete_installation(text,text,uuid,text)') IS NULL OR NOT EXISTS (
    SELECT 1
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE p.oid='public.kiosk_board_complete_installation(text,text,uuid,text)'::regprocedure
       AND n.nspname='public'
       AND pg_get_userbyid(p.proowner)='postgres'
       AND NOT p.prosecdef
       AND p.prorettype='record'::regtype
       AND p.proconfig IS NULL
       AND md5(p.prosrc)='7a71983676c971951d4b982c8c59664d'
       AND has_function_privilege('anon',p.oid,'EXECUTE')
       AND has_function_privilege('authenticated',p.oid,'EXECUTE')
       AND has_function_privilege('service_role',p.oid,'EXECUTE')
  )
  THEN RAISE EXCEPTION '19N_ABORTED_PRECONDITION_KIOSK_BOARD_COMPLETE_INSTALLATION'; END IF;

  IF to_regprocedure('public.kiosk_board_list()') IS NULL OR NOT EXISTS (
    SELECT 1
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE p.oid='public.kiosk_board_list()'::regprocedure
       AND n.nspname='public'
       AND pg_get_userbyid(p.proowner)='postgres'
       AND NOT p.prosecdef
       AND p.prorettype='public.os_kiosk_board'::regtype
       AND p.proconfig IS NULL
       AND md5(p.prosrc)='58ce3dd82b1359bc2eed1896f7137a4f'
       AND has_function_privilege('anon',p.oid,'EXECUTE')
       AND has_function_privilege('authenticated',p.oid,'EXECUTE')
       AND has_function_privilege('service_role',p.oid,'EXECUTE')
  )
  THEN RAISE EXCEPTION '19N_ABORTED_PRECONDITION_KIOSK_BOARD_LIST'; END IF;

  IF to_regprocedure('public.kiosk_board_move(text,text,uuid,text)') IS NULL OR NOT EXISTS (
    SELECT 1
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE p.oid='public.kiosk_board_move(text,text,uuid,text)'::regprocedure
       AND n.nspname='public'
       AND pg_get_userbyid(p.proowner)='postgres'
       AND NOT p.prosecdef
       AND p.prorettype='record'::regtype
       AND p.proconfig IS NULL
       AND md5(p.prosrc)='4c597bf99a69a2a68183c3ae5f97892f'
       AND has_function_privilege('anon',p.oid,'EXECUTE')
       AND has_function_privilege('authenticated',p.oid,'EXECUTE')
       AND has_function_privilege('service_role',p.oid,'EXECUTE')
  )
  THEN RAISE EXCEPTION '19N_ABORTED_PRECONDITION_KIOSK_BOARD_MOVE'; END IF;

  IF to_regprocedure('public.kiosk_board_refresh_snapshot(text)') IS NULL OR NOT EXISTS (
    SELECT 1
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE p.oid='public.kiosk_board_refresh_snapshot(text)'::regprocedure
       AND n.nspname='public'
       AND pg_get_userbyid(p.proowner)='postgres'
       AND NOT p.prosecdef
       AND p.prorettype='public.os_kiosk_board'::regtype
       AND p.proconfig IS NULL
       AND md5(p.prosrc)='bbc4ba31651f7c6d021198562bd5087a'
       AND has_function_privilege('anon',p.oid,'EXECUTE')
       AND has_function_privilege('authenticated',p.oid,'EXECUTE')
       AND has_function_privilege('service_role',p.oid,'EXECUTE')
  )
  THEN RAISE EXCEPTION '19N_ABORTED_PRECONDITION_KIOSK_BOARD_REFRESH_SNAPSHOT'; END IF;

  IF to_regprocedure('public.kiosk_board_register(text,uuid,text,uuid,text)') IS NULL OR NOT EXISTS (
    SELECT 1
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE p.oid='public.kiosk_board_register(text,uuid,text,uuid,text)'::regprocedure
       AND n.nspname='public'
       AND pg_get_userbyid(p.proowner)='postgres'
       AND NOT p.prosecdef
       AND p.prorettype='public.os_kiosk_board'::regtype
       AND p.proconfig IS NULL
       AND md5(p.prosrc)='44f367d7fe5133274571206000cbf915'
       AND has_function_privilege('anon',p.oid,'EXECUTE')
       AND has_function_privilege('authenticated',p.oid,'EXECUTE')
       AND has_function_privilege('service_role',p.oid,'EXECUTE')
  )
  THEN RAISE EXCEPTION '19N_ABORTED_PRECONDITION_KIOSK_BOARD_REGISTER'; END IF;

END;
$preflight$;

-- Scope: six function-level configuration changes only.
ALTER FUNCTION public.kiosk_board_cleanup_orphans(text) SET search_path TO '';

ALTER FUNCTION public.kiosk_board_complete_installation(text,text,uuid,text) SET search_path TO '';

ALTER FUNCTION public.kiosk_board_list() SET search_path TO '';

ALTER FUNCTION public.kiosk_board_move(text,text,uuid,text) SET search_path TO '';

ALTER FUNCTION public.kiosk_board_refresh_snapshot(text) SET search_path TO '';

ALTER FUNCTION public.kiosk_board_register(text,uuid,text,uuid,text) SET search_path TO '';

DO $postcheck$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE p.oid='public.kiosk_board_cleanup_orphans(text)'::regprocedure
       AND n.nspname='public'
       AND pg_get_userbyid(p.proowner)='postgres'
       AND NOT p.prosecdef
       AND p.prorettype='record'::regtype
       AND md5(p.prosrc)='8c0c40661ffcf23390f304a488873845'
       AND p.proconfig @> ARRAY['search_path=""']::text[]
       AND has_function_privilege('anon',p.oid,'EXECUTE')
       AND has_function_privilege('authenticated',p.oid,'EXECUTE')
       AND has_function_privilege('service_role',p.oid,'EXECUTE')
  )
  THEN RAISE EXCEPTION '19N_ABORTED_POSTCONDITION_KIOSK_BOARD_CLEANUP_ORPHANS'; END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE p.oid='public.kiosk_board_complete_installation(text,text,uuid,text)'::regprocedure
       AND n.nspname='public'
       AND pg_get_userbyid(p.proowner)='postgres'
       AND NOT p.prosecdef
       AND p.prorettype='record'::regtype
       AND md5(p.prosrc)='7a71983676c971951d4b982c8c59664d'
       AND p.proconfig @> ARRAY['search_path=""']::text[]
       AND has_function_privilege('anon',p.oid,'EXECUTE')
       AND has_function_privilege('authenticated',p.oid,'EXECUTE')
       AND has_function_privilege('service_role',p.oid,'EXECUTE')
  )
  THEN RAISE EXCEPTION '19N_ABORTED_POSTCONDITION_KIOSK_BOARD_COMPLETE_INSTALLATION'; END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE p.oid='public.kiosk_board_list()'::regprocedure
       AND n.nspname='public'
       AND pg_get_userbyid(p.proowner)='postgres'
       AND NOT p.prosecdef
       AND p.prorettype='public.os_kiosk_board'::regtype
       AND md5(p.prosrc)='58ce3dd82b1359bc2eed1896f7137a4f'
       AND p.proconfig @> ARRAY['search_path=""']::text[]
       AND has_function_privilege('anon',p.oid,'EXECUTE')
       AND has_function_privilege('authenticated',p.oid,'EXECUTE')
       AND has_function_privilege('service_role',p.oid,'EXECUTE')
  )
  THEN RAISE EXCEPTION '19N_ABORTED_POSTCONDITION_KIOSK_BOARD_LIST'; END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE p.oid='public.kiosk_board_move(text,text,uuid,text)'::regprocedure
       AND n.nspname='public'
       AND pg_get_userbyid(p.proowner)='postgres'
       AND NOT p.prosecdef
       AND p.prorettype='record'::regtype
       AND md5(p.prosrc)='4c597bf99a69a2a68183c3ae5f97892f'
       AND p.proconfig @> ARRAY['search_path=""']::text[]
       AND has_function_privilege('anon',p.oid,'EXECUTE')
       AND has_function_privilege('authenticated',p.oid,'EXECUTE')
       AND has_function_privilege('service_role',p.oid,'EXECUTE')
  )
  THEN RAISE EXCEPTION '19N_ABORTED_POSTCONDITION_KIOSK_BOARD_MOVE'; END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE p.oid='public.kiosk_board_refresh_snapshot(text)'::regprocedure
       AND n.nspname='public'
       AND pg_get_userbyid(p.proowner)='postgres'
       AND NOT p.prosecdef
       AND p.prorettype='public.os_kiosk_board'::regtype
       AND md5(p.prosrc)='bbc4ba31651f7c6d021198562bd5087a'
       AND p.proconfig @> ARRAY['search_path=""']::text[]
       AND has_function_privilege('anon',p.oid,'EXECUTE')
       AND has_function_privilege('authenticated',p.oid,'EXECUTE')
       AND has_function_privilege('service_role',p.oid,'EXECUTE')
  )
  THEN RAISE EXCEPTION '19N_ABORTED_POSTCONDITION_KIOSK_BOARD_REFRESH_SNAPSHOT'; END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE p.oid='public.kiosk_board_register(text,uuid,text,uuid,text)'::regprocedure
       AND n.nspname='public'
       AND pg_get_userbyid(p.proowner)='postgres'
       AND NOT p.prosecdef
       AND p.prorettype='public.os_kiosk_board'::regtype
       AND md5(p.prosrc)='44f367d7fe5133274571206000cbf915'
       AND p.proconfig @> ARRAY['search_path=""']::text[]
       AND has_function_privilege('anon',p.oid,'EXECUTE')
       AND has_function_privilege('authenticated',p.oid,'EXECUTE')
       AND has_function_privilege('service_role',p.oid,'EXECUTE')
  )
  THEN RAISE EXCEPTION '19N_ABORTED_POSTCONDITION_KIOSK_BOARD_REGISTER'; END IF;

END;
$postcheck$;
