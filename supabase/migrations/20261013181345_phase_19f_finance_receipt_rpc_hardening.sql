-- 19F: validate authorized Hub OS user and original R2 proof.
-- The existing 1/1, 1/2, 2/2 pricing and installment behavior is unchanged.
DO $preflight$
BEGIN
  IF to_regprocedure('public.finance_upsert_from_asset(uuid,uuid,text,date)') IS NULL
     OR to_regprocedure('public.has_module_access(uuid,text)') IS NULL
     OR to_regclass('public.os_order_assets') IS NULL
     OR to_regclass('public.os_orders') IS NULL
     OR to_regclass('public.os_finance_installments') IS NULL THEN
    RAISE EXCEPTION '19F_ABORTED_REQUIRED_OBJECT_MISSING';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.finance_upsert_from_asset(uuid,uuid,text,date)'::regprocedure
      AND p.prosecdef
      AND p.prosrc LIKE '%on conflict (os_id, installment_no)%'
      AND p.prosrc LIKE '%if p_installment_label = ''1/1''%'
      AND p.prosrc LIKE '%if p_installment_label = ''1/2''%'
      AND p.prosrc LIKE '%if p_installment_label = ''2/2''%'
  ) THEN
    RAISE EXCEPTION '19F_ABORTED_UNRECOGNIZED_FINANCE_FUNCTION';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid='public.os_order_assets'::regclass AND c.relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid='public.os_orders'::regclass AND c.relrowsecurity)
     OR NOT has_function_privilege('authenticated','public.finance_upsert_from_asset(uuid,uuid,text,date)','EXECUTE') THEN
    RAISE EXCEPTION '19F_ABORTED_CURRENT_PERMISSIONS_UNEXPECTED';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.finance_upsert_from_asset(p_os_id uuid, p_asset_id uuid, p_installment_label text, p_second_due_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_module_access(v_actor_id, 'hub_os') THEN
    RAISE EXCEPTION 'Sem permissão para registrar comprovantes da OS.' USING ERRCODE = '42501';
  END IF;
  IF p_os_id IS NULL OR p_asset_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.os_orders o WHERE o.id = p_os_id) THEN
    RAISE EXCEPTION 'OS ou comprovante inválido.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.os_order_assets a
    WHERE a.id = p_asset_id
      AND a.os_id = p_os_id
      AND a.asset_type = 'PAYMENT_PROOF'
      AND a.uploaded_by = v_actor_id
      AND a.storage_provider = 'r2'
      AND a.deleted_from_storage_at IS NULL
      AND a.error IS NULL
  ) THEN
    RAISE EXCEPTION 'Comprovante não pertence à OS ou ao usuário autenticado.' USING ERRCODE = '22023';
  END IF;

  if p_installment_label not in ('1/1', '1/2', '2/2') then
    raise exception 'Parcela inválida: %', p_installment_label;
  end if;

  if p_installment_label = '1/1' then
    insert into public.os_finance_installments (
      os_id, installment_no, total_installments, asset_id, status, due_date, created_by
    )
    values (
      p_os_id, 1, 1, p_asset_id, 'PENDING_REVIEW', null, auth.uid()
    )
    on conflict (os_id, installment_no)
    do update set
      total_installments = excluded.total_installments,
      asset_id = excluded.asset_id,
      status = excluded.status,
      due_date = null;

    delete from public.os_finance_installments
    where os_id = p_os_id
      and installment_no = 2;

    return;
  end if;

  if p_installment_label = '1/2' then
    if p_second_due_date is null then
      raise exception 'Data da 2ª parcela é obrigatória para 1/2';
    end if;

    insert into public.os_finance_installments (
      os_id, installment_no, total_installments, asset_id, status, due_date, created_by
    )
    values (
      p_os_id, 1, 2, p_asset_id, 'PENDING_REVIEW', null, auth.uid()
    )
    on conflict (os_id, installment_no)
    do update set
      total_installments = excluded.total_installments,
      asset_id = excluded.asset_id,
      status = excluded.status,
      due_date = null;

    insert into public.os_finance_installments (
      os_id, installment_no, total_installments, asset_id, status, due_date, created_by
    )
    values (
      p_os_id, 2, 2, null, 'AWAITING_PROOF', p_second_due_date, auth.uid()
    )
    on conflict (os_id, installment_no)
    do update set
      total_installments = 2,
      due_date = excluded.due_date,
      asset_id = null,
      status = 'AWAITING_PROOF';

    return;
  end if;

  if p_installment_label = '2/2' then
    if not exists (
      select 1
      from public.os_finance_installments
      where os_id = p_os_id
        and installment_no = 2
        and total_installments = 2
    ) then
      raise exception 'Parcela 2/2 não encontrada para a OS %', p_os_id;
    end if;

    update public.os_finance_installments
    set asset_id = p_asset_id,
        status = 'PENDING_REVIEW'
    where os_id = p_os_id
      and installment_no = 2;

    return;
  end if;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.finance_upsert_from_asset(uuid,uuid,text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_upsert_from_asset(uuid,uuid,text,date) TO authenticated, service_role;

DO $assert$
BEGIN
  IF has_function_privilege('anon','public.finance_upsert_from_asset(uuid,uuid,text,date)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.finance_upsert_from_asset(uuid,uuid,text,date)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.finance_upsert_from_asset(uuid,uuid,text,date)','EXECUTE')
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc p
       WHERE p.oid = 'public.finance_upsert_from_asset(uuid,uuid,text,date)'::regprocedure
         AND p.prosecdef
         AND p.prosrc LIKE '%v_actor_id uuid := auth.uid()%'
         AND p.prosrc LIKE '%public.has_module_access(v_actor_id, ''hub_os'')%'
         AND p.prosrc LIKE '%a.uploaded_by = v_actor_id%'
         AND p.prosrc LIKE '%a.storage_provider = ''r2''%'
         AND p.prosrc LIKE '%a.asset_type = ''PAYMENT_PROOF''%'
     )
  THEN
    RAISE EXCEPTION '19F_ABORTED_POSTCONDITION_FAILED';
  END IF;
END;
$assert$;
