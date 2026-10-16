-- EVOLUSYSTEM — MIGRATION APLICADA COM AUTORIZACAO EM 2026-10-16.
-- Acrescenta RPC segura de salvamento condicional de observacoes finais.
-- Nao altera funcoes anteriores, tabelas, eventos nem politicas RLS.

create or replace function public.hub_os_update_installation_completion_notes_if_current(
  p_installation_id uuid,
  p_expected_updated_at timestamptz,
  p_notes text
)
returns public.os_installations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_installation public.os_installations;
begin
  select * into v_installation
    from public.os_installations
    where id = p_installation_id
    for update;

  if not found then
    raise exception 'Instalacao nao encontrada.' using errcode='P0002';
  end if;

  -- Preserves executor/team/management checks from the existing protected RPC
  -- before disclosing version details.
  perform public.hub_os_assert_installation_executor(v_installation, false);

  if p_expected_updated_at is null then
    raise exception 'Versao original das observacoes obrigatoria.' using errcode='22023';
  end if;

  if v_installation.updated_at is distinct from p_expected_updated_at then
    raise exception 'As observacoes da instalacao foram atualizadas por outro colaborador. Seu texto nao foi salvo; atualize a pagina para revisar.'
      using errcode='P0001';
  end if;

  -- Existing RPC maintains IN_PROGRESS-only editing, length limit, author and
  -- updated_at. The nested call remains within the same database transaction.
  return public.hub_os_update_installation_completion_notes_secure(
    p_installation_id, p_notes
  );
end;
$function$;

revoke all on function public.hub_os_update_installation_completion_notes_if_current(uuid,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.hub_os_update_installation_completion_notes_if_current(uuid,timestamptz,text)
  to authenticated;
