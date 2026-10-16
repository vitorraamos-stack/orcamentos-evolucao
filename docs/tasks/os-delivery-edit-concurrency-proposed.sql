-- EVOLUSYSTEM — SQL PROPOSTO, NAO EXECUTAR SEM AUTORIZACAO ESPECIFICA.
-- Additive optimistic concurrency guard for DELIVERY DETAILS only.
-- Existing secure RPC retains authorization, editable statuses, field validations,
-- item/OS workflow and transactional event logging. No table or RLS change.
-- Current legacy writers bypass this guard; no generic updated_at trigger observed.

create or replace function public.hub_os_update_delivery_if_current(
  p_delivery_id uuid,
  p_expected_updated_at timestamptz,
  p_scheduled_at timestamptz,
  p_assigned_to uuid,
  p_vehicle_label text,
  p_carrier_name text,
  p_tracking_code text,
  p_notes text
)
returns public.os_deliveries
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_updated_at timestamptz;
begin
  -- Canonical DELIVIERY access check, before any row lock or data disclosure.
  perform public.hub_os_assert_logistics_actor('DELIVERY');
  if p_expected_updated_at is null then
    raise exception 'Versao original da entrega obrigatoria.' using errcode='22023';
  end if;

  select d.updated_at into v_updated_at
    from public.os_deliveries d where d.id = p_delivery_id for update;
  if not found then
    raise exception 'Entrega nao encontrada.' using errcode='P0002';
  end if;
  if v_updated_at is distinct from p_expected_updated_at then
    raise exception 'Esta entrega foi alterada por outro colaborador. Nenhuma alteracao foi salva. Atualize Entregas e revise os dados.'
      using errcode='P0001';
  end if;

  -- The existing secure RPC also checks editable delivery status and logs
  -- the change in the SAME transaction.
  return public.hub_os_update_delivery_secure(
    p_delivery_id, p_scheduled_at, p_assigned_to, p_vehicle_label,
    p_carrier_name, p_tracking_code, p_notes
  );
end;
$function$;

revoke all on function public.hub_os_update_delivery_if_current(uuid,timestamptz,timestamptz,uuid,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.hub_os_update_delivery_if_current(uuid,timestamptz,timestamptz,uuid,text,text,text,text)
  to authenticated;

comment on function public.hub_os_update_delivery_if_current(uuid,timestamptz,timestamptz,uuid,text,text,text,text)
  is 'Authenticated logistics role, optimistic version check and transactional delegation for delivery details.';
