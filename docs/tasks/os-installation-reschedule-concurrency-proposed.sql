-- EVOLUSYSTEM — SQL PROPOSTO, NÃO APLICADO. Requer autorização específica.
-- Protege apenas o reagendamento; mantém a RPC protegida existente intacta.
-- Preserva checagem de conflito de equipe/horário, autorização e auditoria.
-- Legados que não renovam updated_at seguem fora da proteção.

create or replace function public.hub_os_reschedule_installation_if_current(
  p_installation_id uuid,
  p_expected_updated_at timestamptz,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_team_id uuid,
  p_responsible_id uuid,
  p_estimated_duration_minutes integer,
  p_vehicle_label text,
  p_notes text,
  p_override_conflict boolean
)
returns public.os_installations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_updated_at timestamptz;
begin
  -- Acesso de gerente à instalação é validado antes do bloqueio da linha.
  perform public.hub_os_assert_logistics_actor('INSTALLATION');
  if p_expected_updated_at is null then
    raise exception 'Versão original da instalação obrigatória.' using errcode='22023';
  end if;
  select i.updated_at into v_updated_at
    from public.os_installations i
    where i.id = p_installation_id
    for update;
  if not found then
    raise exception 'Instalação não encontrada.' using errcode='P0002';
  end if;
  if v_updated_at is distinct from p_expected_updated_at then
    raise exception 'Esta instalação foi modificada por outro colaborador. O reagendamento não foi salvo. Atualize a agenda e revise as informações.'
      using errcode='P0001';
  end if;

  -- A RPC original confere status SCHEDULED, conflitos de agenda,
  -- vínculos de equipe e gera o evento de auditoria na mesma transação.
  return public.hub_os_reschedule_installation_secure(
    p_installation_id, p_scheduled_start, p_scheduled_end,
    p_team_id, p_responsible_id, p_estimated_duration_minutes,
    p_vehicle_label, p_notes, p_override_conflict
  );
end;
$function$;

revoke all on function public.hub_os_reschedule_installation_if_current(uuid,timestamptz,timestamptz,timestamptz,uuid,uuid,integer,text,text,boolean)
  from public, anon, authenticated;
grant execute on function public.hub_os_reschedule_installation_if_current(uuid,timestamptz,timestamptz,timestamptz,uuid,uuid,integer,text,text,boolean)
  to authenticated;
