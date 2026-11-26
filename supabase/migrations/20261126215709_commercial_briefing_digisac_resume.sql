begin;
set local lock_timeout = '3s';

-- Serialize only the Digisac creation path for an authenticated owner and
-- exact attendance. The manual workflow still supports multiple negotiations.
create function public.commercial_briefing_create_for_digisac(
  p_id uuid, p_contact_id text, p_ticket_id text, p_draft jsonb
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null or commercial_briefing_private.actor_role() is null then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_id is null or p_contact_id is null or p_ticket_id is null
    or p_contact_id !~ '^[a-zA-Z0-9_-]{1,200}$'
    or p_ticket_id !~ '^[a-zA-Z0-9_-]{1,200}$' then
    raise exception 'Referências inválidas.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.jsonb_build_array('commercial-briefing-digisac', actor_id, p_contact_id, p_ticket_id)::text, 0
  ));

  if exists (
    select 1 from public.commercial_briefings b
    where b.consultant_id = actor_id
      and b.digisac_contact_id = p_contact_id
      and b.digisac_ticket_id = p_ticket_id
      and b.cancelled_at is null
      and b.os_id is null
  ) then
    return null;
  end if;

  return (commercial_briefing_private.create_draft(p_id, p_contact_id, p_ticket_id, p_draft)).id;
end;
$$;

revoke all on function public.commercial_briefing_create_for_digisac(uuid,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.commercial_briefing_create_for_digisac(uuid,text,text,jsonb)
  to authenticated;

commit;
