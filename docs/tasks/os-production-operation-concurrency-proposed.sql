-- EVOLUSYSTEM - PROPOSTA, NAO APLICADA: requer autorizacao separada.
-- Somente RPCs adicionais. Legacy RPCs, status, recomputacao e auditoria intactos.
-- A tabela de operacoes tem updated_at, mas nao trigger automatico observado.
-- As RPCs de gravacao existentes atualizam updated_at explicitamente.
-- Escritores legados sem verificacao de versao continuam uma limitacao.

create or replace function public.hub_os_update_item_operation_if_current(
  p_operation_id uuid, p_expected_updated_at timestamptz,
  p_work_center text, p_assigned_to uuid, p_is_required boolean, p_notes text, p_sort_order integer
)
returns public.os_order_item_operations
language plpgsql security definer set search_path = ''
as $function$
declare v_updated_at timestamptz;
begin
  perform public.hub_os_assert_operation_access();
  if p_expected_updated_at is null then
    raise exception 'Versao original da operacao obrigatoria.' using errcode='22023';
  end if;
  select op.updated_at into v_updated_at
  from public.os_order_item_operations op
  where op.id=p_operation_id and op.deleted_at is null for update;
  if not found then
    raise exception 'Operacao nao encontrada.' using errcode='P0002';
  end if;
  if v_updated_at is distinct from p_expected_updated_at then
    raise exception 'Esta operacao foi alterada por outro colaborador. A alteracao nao foi salva. Atualize a OS e revise os dados.'
      using errcode='P0001';
  end if;
  return public.hub_os_update_item_operation_secure(p_operation_id,p_work_center,p_assigned_to,p_is_required,p_notes,p_sort_order);
end;
$function$;

revoke all on function public.hub_os_update_item_operation_if_current(uuid,timestamptz,text,uuid,boolean,text,integer) from public,anon,authenticated;
grant execute on function public.hub_os_update_item_operation_if_current(uuid,timestamptz,text,uuid,boolean,text,integer) to authenticated;

create or replace function public.hub_os_set_item_operation_status_if_current(
  p_operation_id uuid, p_expected_updated_at timestamptz,
  p_status text, p_blocked_reason text default null, p_notes text default null
)
returns public.os_order_item_operations
language plpgsql security definer set search_path = ''
as $function$
declare v_updated_at timestamptz;
begin
  perform public.hub_os_assert_operation_access();
  if p_expected_updated_at is null then
    raise exception 'Versao original da operacao obrigatoria.' using errcode='22023';
  end if;
  select op.updated_at into v_updated_at
  from public.os_order_item_operations op
  where op.id=p_operation_id and op.deleted_at is null for update;
  if not found then
    raise exception 'Operacao nao encontrada.' using errcode='P0002';
  end if;
  if v_updated_at is distinct from p_expected_updated_at then
    raise exception 'Esta operacao foi alterada por outro colaborador. A alteracao nao foi salva. Atualize a OS e revise os dados.'
      using errcode='P0001';
  end if;
  return public.hub_os_set_item_operation_status_secure(p_operation_id,p_status,p_blocked_reason,p_notes);
end;
$function$;

revoke all on function public.hub_os_set_item_operation_status_if_current(uuid,timestamptz,text,text,text) from public,anon,authenticated;
grant execute on function public.hub_os_set_item_operation_status_if_current(uuid,timestamptz,text,text,text) to authenticated;

create or replace function public.hub_os_delete_item_operation_if_current(
  p_operation_id uuid, p_expected_updated_at timestamptz
)
returns public.os_order_item_operations
language plpgsql security definer set search_path = ''
as $function$
declare v_updated_at timestamptz;
begin
  perform public.hub_os_assert_operation_access(true);
  if p_expected_updated_at is null then
    raise exception 'Versao original da operacao obrigatoria.' using errcode='22023';
  end if;
  select op.updated_at into v_updated_at
  from public.os_order_item_operations op
  where op.id=p_operation_id and op.deleted_at is null for update;
  if not found then
    raise exception 'Operacao nao encontrada.' using errcode='P0002';
  end if;
  if v_updated_at is distinct from p_expected_updated_at then
    raise exception 'Esta operacao foi alterada por outro colaborador. A alteracao nao foi salva. Atualize a OS e revise os dados.'
      using errcode='P0001';
  end if;
  return public.hub_os_delete_item_operation_secure(p_operation_id);
end;
$function$;

revoke all on function public.hub_os_delete_item_operation_if_current(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.hub_os_delete_item_operation_if_current(uuid,timestamptz) to authenticated;

