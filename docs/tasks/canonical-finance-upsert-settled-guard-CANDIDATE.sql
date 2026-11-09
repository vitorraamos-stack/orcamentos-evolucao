-- EvoluSystem — Canonical finance receipt protection.
-- REVIEW ONLY. NOT APPLIED. DO NOT ADD TO supabase/migrations.
-- This candidate enforces the approved rule: settled (CONCILIADO) or
-- booked (LANCADO) installments cannot be replaced/restructured by
-- the normal receipt upload. A separate admin-only, audited correction
-- procedure must be designed before changing such installments.
--
-- Does not alter legacy financial 19V-C2 or apply PR #523's ACL proposal.
-- Security note: the parent row lock serializes uploads per OS, and
-- a child FOR UPDATE lock synchronizes checks with direct BPO updates.
-- This is a code proposal, NOT real-JWT or concurrency homologation.

DO $preflight$
BEGIN
 IF current_user <> 'postgres' THEN
   RAISE EXCEPTION 'FINANCE_UPSERT_GUARD_UNEXPECTED_EXECUTOR' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM pg_proc p
   WHERE p.oid='public.finance_upsert_from_asset(uuid,uuid,text,date)'::regprocedure
     AND p.prosecdef
     AND pg_get_userbyid(p.proowner)='postgres'
     AND md5(p.prosrc)='9bc1567dad2ab1640a82bf9893fc8ef3'
 ) THEN
   RAISE EXCEPTION 'FINANCE_UPSERT_GUARD_FUNCTION_DRIFT' USING ERRCODE='55000';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM pg_class c
   WHERE c.oid='public.os_finance_installments'::regclass AND c.relrowsecurity
 ) OR NOT EXISTS (
   SELECT 1 FROM pg_class c
   WHERE c.oid='public.os_orders'::regclass AND c.relrowsecurity
 ) OR NOT EXISTS (
   SELECT 1 FROM pg_class c
   WHERE c.oid='public.os_order_assets'::regclass AND c.relrowsecurity
 ) THEN
   RAISE EXCEPTION 'FINANCE_UPSERT_GUARD_RLS_DRIFT' USING ERRCODE='55000';
 END IF;
 IF NOT has_function_privilege(
     'authenticated','public.finance_upsert_from_asset(uuid,uuid,text,date)','EXECUTE'
   ) OR has_function_privilege(
     'anon','public.finance_upsert_from_asset(uuid,uuid,text,date)','EXECUTE'
   ) THEN
   RAISE EXCEPTION 'FINANCE_UPSERT_GUARD_EXECUTE_ACL_DRIFT' USING ERRCODE='55000';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM pg_constraint c
   WHERE c.conrelid='public.os_finance_installments'::regclass
     AND c.conname='os_finance_installments_os_id_installment_no_key'
     AND c.contype='u' AND c.convalidated
 ) THEN
   RAISE EXCEPTION 'FINANCE_UPSERT_GUARD_UNIQUE_CONSTRAINT_MISSING' USING ERRCODE='55000';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
   WHERE t.tgrelid='public.os_finance_installments'::regclass
     AND t.tgname='trg_os_finance_installment_audit'
     AND t.tgenabled='O' AND NOT t.tgisinternal
     AND md5(p.prosrc)='df7e652e9ec347cdd3583209e9b0d44f'
 ) THEN
   RAISE EXCEPTION 'FINANCE_UPSERT_GUARD_AUDIT_TRIGGER_DRIFT' USING ERRCODE='55000';
 END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.finance_upsert_from_asset(
 p_os_id uuid,
 p_asset_id uuid,
 p_installment_label text,
 p_second_due_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $finance$
DECLARE
 v_actor_id uuid := auth.uid();
BEGIN
 IF v_actor_id IS NULL THEN
   RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE='42501';
 END IF;

 IF NOT public.has_module_access(v_actor_id,'hub_os') THEN
   RAISE EXCEPTION 'Sem permissão para registrar comprovantes da OS.'
     USING ERRCODE='42501';
 END IF;

 IF p_os_id IS NULL OR p_asset_id IS NULL
    OR p_installment_label NOT IN ('1/1','1/2','2/2')
    OR p_installment_label IS NULL
 THEN
   RAISE EXCEPTION 'OS, comprovante ou parcela inválidos.'
     USING ERRCODE='22023';
 END IF;

 IF p_installment_label='1/2' AND p_second_due_date IS NULL THEN
   RAISE EXCEPTION 'Data da 2ª parcela é obrigatória para 1/2'
     USING ERRCODE='22023';
 END IF;

 -- One OS-level lock serializes normal uploads, including simultaneous
 -- inserts where no installment rows exist yet. NO KEY UPDATE allows
 -- concurrent FK KEY SHARE checks from status-audit insertions.
 PERFORM 1 FROM public.os_orders o
 WHERE o.id=p_os_id
 FOR NO KEY UPDATE;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'OS ou comprovante inválido.' USING ERRCODE='22023';
 END IF;

 IF NOT EXISTS (
   SELECT 1 FROM public.os_order_assets a
   WHERE a.id=p_asset_id
     AND a.os_id=p_os_id
     AND a.asset_type='PAYMENT_PROOF'
     AND a.uploaded_by=v_actor_id
     AND a.storage_provider='r2'
     AND a.deleted_from_storage_at IS NULL
     AND a.error IS NULL
 ) THEN
   RAISE EXCEPTION 'Comprovante não pertence à OS ou ao usuário autenticado.'
     USING ERRCODE='22023';
 END IF;

 -- Concurrent BPO status updates hold row locks on the installments.
 -- Take those locks before deciding whether any change is allowed.
 PERFORM 1 FROM public.os_finance_installments i
 WHERE i.os_id=p_os_id
 ORDER BY i.installment_no
 FOR UPDATE;

 -- Changing 1/1 or 1/2 potentially rewrites installment 1 AND
 -- creates/deletes/rewrites installment 2. Block if either was settled.
 IF p_installment_label IN ('1/1','1/2') AND EXISTS (
   SELECT 1 FROM public.os_finance_installments i
   WHERE i.os_id=p_os_id AND i.installment_no IN (1,2)
     AND i.status IN ('CONCILIADO','LANCADO')
 ) THEN
   RAISE EXCEPTION 'Parcela já conciliada ou lançada. Correção exige procedimento administrativo.'
     USING ERRCODE='23514';
 END IF;

 -- For 2/2, installment 1 can be settled; it is not modified here.
 -- The second installment must still be available for normal receipt.
 IF p_installment_label='2/2' AND EXISTS (
   SELECT 1 FROM public.os_finance_installments i
   WHERE i.os_id=p_os_id AND i.installment_no=2
     AND i.status IN ('CONCILIADO','LANCADO')
 ) THEN
   RAISE EXCEPTION 'Segunda parcela já conciliada ou lançada. Correção exige procedimento administrativo.'
     USING ERRCODE='23514';
 END IF;

 IF p_installment_label='1/1' THEN
   INSERT INTO public.os_finance_installments
    (os_id,installment_no,total_installments,asset_id,status,due_date,created_by)
   VALUES
    (p_os_id,1,1,p_asset_id,'PENDING_REVIEW',NULL,v_actor_id)
   ON CONFLICT (os_id,installment_no)
   DO UPDATE SET
     total_installments=EXCLUDED.total_installments,
     asset_id=EXCLUDED.asset_id,
     status=EXCLUDED.status,
     due_date=NULL;

   DELETE FROM public.os_finance_installments
   WHERE os_id=p_os_id AND installment_no=2;
   RETURN;
 END IF;

 IF p_installment_label='1/2' THEN
   INSERT INTO public.os_finance_installments
    (os_id,installment_no,total_installments,asset_id,status,due_date,created_by)
   VALUES
    (p_os_id,1,2,p_asset_id,'PENDING_REVIEW',NULL,v_actor_id)
   ON CONFLICT (os_id,installment_no)
   DO UPDATE SET
     total_installments=EXCLUDED.total_installments,
     asset_id=EXCLUDED.asset_id,
     status=EXCLUDED.status,
     due_date=NULL;

   INSERT INTO public.os_finance_installments
    (os_id,installment_no,total_installments,asset_id,status,due_date,created_by)
   VALUES
    (p_os_id,2,2,NULL,'AWAITING_PROOF',p_second_due_date,v_actor_id)
   ON CONFLICT (os_id,installment_no)
   DO UPDATE SET
     total_installments=2,
     due_date=EXCLUDED.due_date,
     asset_id=NULL,
     status='AWAITING_PROOF';
   RETURN;
 END IF;

 -- Exact 2/2 path; other installment remains untouched.
 IF NOT EXISTS (
   SELECT 1 FROM public.os_finance_installments i
   WHERE i.os_id=p_os_id AND i.installment_no=2
     AND i.total_installments=2
 ) THEN
   RAISE EXCEPTION 'Parcela 2/2 não encontrada para a OS %',p_os_id
     USING ERRCODE='22023';
 END IF;

 UPDATE public.os_finance_installments
 SET asset_id=p_asset_id, status='PENDING_REVIEW'
 WHERE os_id=p_os_id AND installment_no=2;
END;
$finance$;

DO $postcheck$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_proc p
   WHERE p.oid='public.finance_upsert_from_asset(uuid,uuid,text,date)'::regprocedure
     AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres'
     AND p.proconfig=ARRAY['search_path=']::text[]
     AND p.prosrc LIKE '%FOR NO KEY UPDATE%'
     AND p.prosrc LIKE '%FOR UPDATE%'
     AND p.prosrc LIKE '%''CONCILIADO'',''LANCADO''%'
     AND p.prosrc LIKE '%procedimento administrativo%'
 ) THEN
   RAISE EXCEPTION 'FINANCE_UPSERT_GUARD_POSTCHECK_FUNCTION' USING ERRCODE='55000';
 END IF;
 IF NOT has_function_privilege(
     'authenticated','public.finance_upsert_from_asset(uuid,uuid,text,date)','EXECUTE'
   ) OR has_function_privilege(
     'anon','public.finance_upsert_from_asset(uuid,uuid,text,date)','EXECUTE'
   ) OR NOT has_function_privilege(
     'service_role','public.finance_upsert_from_asset(uuid,uuid,text,date)','EXECUTE'
   ) THEN
   RAISE EXCEPTION 'FINANCE_UPSERT_GUARD_POSTCHECK_PRIVILEGES' USING ERRCODE='55000';
 END IF;
END;
$postcheck$;

-- REVIEW ONLY. No permission granted to apply this SQL in production.
