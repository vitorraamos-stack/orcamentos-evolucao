-- EvoluSystem — finance receipt settled-guard baseline (READ ONLY).
-- Does not create test records or call the production RPC.
SELECT
  (SELECT md5(prosrc) FROM pg_proc WHERE
   oid='public.finance_upsert_from_asset(uuid,uuid,text,date)'::regprocedure)
    AS current_upsert_hash,
  (SELECT prosecdef FROM pg_proc WHERE
   oid='public.finance_upsert_from_asset(uuid,uuid,text,date)'::regprocedure)
    AS current_function_is_security_definer,
  has_function_privilege('authenticated',
    'public.finance_upsert_from_asset(uuid,uuid,text,date)','EXECUTE')
    AS auth_can_call_upsert,
  NOT has_function_privilege('anon',
    'public.finance_upsert_from_asset(uuid,uuid,text,date)','EXECUTE')
    AS anon_cannot_call_upsert,
  (SELECT count(*) FROM public.os_finance_installments)
    AS existing_installment_count,
  (SELECT count(*) FROM public.os_finance_installments
   WHERE status IN ('CONCILIADO','LANCADO'))
    AS settled_installment_count,
  (SELECT count(*) FROM public.os_orders) AS canonical_os_count,
  EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='public.os_finance_installments'::regclass
      AND c.conname='os_finance_installments_os_id_installment_no_key'
      AND c.contype='u'
  ) AS installment_unique_constraint_exists,
  has_table_privilege('authenticated','public.os_finance_installments','UPDATE')
    AS direct_finance_update_still_granted,
  has_table_privilege('authenticated','public.os_orders','DELETE')
    AS direct_parent_delete_still_granted;
