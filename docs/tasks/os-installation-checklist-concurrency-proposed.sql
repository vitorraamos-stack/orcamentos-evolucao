-- EVOLUSYSTEM — SQL PROPOSTO, NAO EXECUTADO. Requer autorizacao especifica.
-- Guarda otimista para UM item de checklist de instalacao.
-- Preserva as regras, o status, o controle do executor e auditoria da RPC legada.
-- A ordem dos bloqueios segue a funcao atual: item -> instalacao.

create or replace function public.hub_os_set_installation_checklist_item_if_current(
  p_item_id uuid,
  p_expected_updated_at timestamptz,
  p_status text,
  p_note text
)
returns public.os_installation_checklist_items
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item public.os_installation_checklist_items;
  v_installation public.os_installations;
begin
  if p_expected_updated_at is null then
    raise exception 'Versao original do checklist obrigatoria.' using errcode='22023';
  end if;

  select * into v_item
    from public.os_installation_checklist_items
    where id = p_item_id
    for update;
  if not found then
    raise exception 'Item do checklist nao encontrado.' using errcode='P0002';
  end if;

  select * into v_installation
    from public.os_installations
    where id = v_item.installation_id
    for update;
  if not found then
    raise exception 'Instalacao nao encontrada.' using errcode='P0002';
  end if;

  -- The same per-installation executor/team/manager authorization as legacy.
  perform public.hub_os_assert_installation_executor(v_installation, false);

  if v_item.updated_at is distinct from p_expected_updated_at then
    raise exception 'Este item do checklist foi atualizado por outro colaborador. Nenhuma alteracao foi salva. Atualize e revise o item.'
      using errcode='P0001';
  end if;

  -- Retains status/phase rules, NOT_APPLICABLE restrictions, completion author
  -- and revision update. Nested call runs within this same transaction.
  return public.hub_os_set_installation_checklist_item_secure(
    p_item_id, p_status, p_note
  );
end;
$function$;

revoke all on function public.hub_os_set_installation_checklist_item_if_current(uuid,timestamptz,text,text)
  from public, anon, authenticated;
grant execute on function public.hub_os_set_installation_checklist_item_if_current(uuid,timestamptz,text,text)
  to authenticated;
