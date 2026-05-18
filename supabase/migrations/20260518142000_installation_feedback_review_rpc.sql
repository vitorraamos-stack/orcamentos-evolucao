create or replace function public.installation_feedback_mark_reviewed_secure(
  p_feedback_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'Usuário não autenticado.'
      using errcode = 'P0001', detail = 'KIOSK_AUTH_REQUIRED';
  end if;

  if not public.is_admin(v_actor_id) then
    raise exception 'Sem permissão para revisar feedbacks de instalação.'
      using errcode = 'P0001', detail = 'KIOSK_MANAGER_REQUIRED';
  end if;

  update public.os_installation_feedbacks
  set
    reviewed = true,
    reviewed_at = coalesce(reviewed_at, now()),
    reviewed_by = coalesce(reviewed_by, v_actor_id)
  where id = p_feedback_id;

  if not found then
    raise exception 'Feedback de instalação não encontrado.'
      using errcode = 'P0001', detail = 'INSTALLATION_FEEDBACK_NOT_FOUND';
  end if;
end;
$$;

revoke all on function public.installation_feedback_mark_reviewed_secure(uuid) from public;
grant execute on function public.installation_feedback_mark_reviewed_secure(uuid) to authenticated;
