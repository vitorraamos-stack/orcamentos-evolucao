begin;
set local lock_timeout = '3s';

-- NULL distinguishes older revisions from saves with recorded field changes.
alter table public.commercial_briefing_revisions
  add column changed_fields text[]
  check (changed_fields is null or event = 'SAVED');

-- Persist field codes only. Draft values and item identifiers are not copied
-- to the revision history.
create function commercial_briefing_private.draft_changed_fields(p_before jsonb, p_after jsonb)
returns text[] language sql immutable set search_path = ''
as $$
  with previous_items as (
    select (item->>'id')::uuid as id, item, position
    from jsonb_array_elements(p_before->'items') with ordinality as items(item, position)
  ), current_items as (
    select (item->>'id')::uuid as id, item, position
    from jsonb_array_elements(p_after->'items') with ordinality as items(item, position)
  ), pairs as (
    select id, p.item as previous, c.item as current,
      p.position as previous_position, c.position as current_position
    from previous_items p full join current_items c using (id)
  ), field_changes as (
    select field from unnest(array[
      'saleNumber','clientName','commercialNotes','artInstructions','artDirectionTag',
      'isUrgent','deadlinePreset','deliveryDate','logisticType','address'
    ]) as fields(field)
    where (p_before->field) is distinct from (p_after->field)
    union all
    select 'itemsAdded' where exists (select 1 from pairs where previous is null)
    union all
    select 'itemsRemoved' where exists (select 1 from pairs where current is null)
    union all
    select 'itemOrder'
    where (select array_agg(id order by previous_position) from pairs where previous is not null and current is not null)
      is distinct from
      (select array_agg(id order by current_position) from pairs where previous is not null and current is not null)
    union all
    select distinct 'item.' || field
    from pairs cross join unnest(array[
      'name','quantity','width_cm','height_cm','measurement_unit','description','notes'
    ]) as fields(field)
    where previous is not null and current is not null
      and (previous->field) is distinct from (current->field)
  )
  select array(select field from field_changes order by field);
$$;
revoke all on function commercial_briefing_private.draft_changed_fields(jsonb,jsonb)
  from public, anon, authenticated;

create or replace function commercial_briefing_private.save_draft(
  p_id uuid, p_expected_revision integer, p_draft jsonb
) returns public.commercial_briefings
language plpgsql security definer set search_path = ''
as $$
declare
  u uuid := auth.uid();
  r public.commercial_briefings;
  changed boolean;
  fields text[];
begin
  if u is null or commercial_briefing_private.actor_role() is null
    then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  select * into r from public.commercial_briefings b where b.id = p_id and b.consultant_id = u for update;
  if not found then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  if p_expected_revision is distinct from r.revision
    then raise exception 'Revisão desatualizada.' using errcode = '40001'; end if;
  if r.cancelled_at is not null or r.os_id is not null
    then raise exception 'Briefing encerrado.' using errcode = '22023'; end if;
  if not commercial_briefing_private.valid_draft(p_draft)
    then raise exception 'Rascunho inválido.' using errcode = '22023'; end if;
  if r.draft = p_draft then return r; end if;
  changed := commercial_briefing_private.terms(r.draft) is distinct from commercial_briefing_private.terms(p_draft);
  fields := commercial_briefing_private.draft_changed_fields(r.draft, p_draft);
  update public.commercial_briefings b set
    draft = p_draft, revision = r.revision + 1,
    commercial_revision = r.commercial_revision + case when changed then 1 else 0 end,
    confirmation = case when changed then null else r.confirmation end,
    updated_at = now()
    where b.id = r.id returning * into r;
  insert into public.commercial_briefing_revisions(briefing_id,revision,commercial_revision,event,actor_id,changed_fields)
    values(r.id,r.revision,r.commercial_revision,'SAVED',u,fields);
  return r;
end;
$$;

commit;
