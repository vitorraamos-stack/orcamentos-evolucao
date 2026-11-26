-- Production installation authorized; additive objects only.
-- Requires the existing profiles, hub_os module access and os_orders contracts.
begin;
set local lock_timeout = '3s';

create schema commercial_briefing_private;
revoke all on schema commercial_briefing_private from public, anon, authenticated;
grant usage on schema commercial_briefing_private to authenticated;

-- Only the current authenticated commercial actor is evaluated.
create function commercial_briefing_private.actor_role()
returns text language sql stable security definer set search_path = ''
as $$
  select case p.role when 'admin' then 'gerente'
    when 'consultor' then 'consultor_vendas' else p.role end
  from public.profiles p
  where p.id = (select auth.uid())
    and p.role in ('admin','gerente','consultor','consultor_vendas')
    and coalesce((auth.jwt()->>'is_anonymous') = 'true', false) = false
    and public.has_module_access(p.id, 'hub_os');
$$;
revoke all on function commercial_briefing_private.actor_role() from public, anon, authenticated;
grant execute on function commercial_briefing_private.actor_role() to authenticated;

-- Draft content is incomplete by design; validate its shape and bounds,
-- not commercial approval. No metadata may be smuggled into the payload.
create function commercial_briefing_private.valid_draft(d jsonb)
returns boolean language plpgsql immutable set search_path = ''
as $$
declare
  k text;
  lim integer;
  i jsonb;
  item_id uuid;
  seen uuid[] := array[]::uuid[];
  keys text[] := array['saleNumber','clientName','items','commercialNotes',
    'artInstructions','artDirectionTag','isUrgent','deadlinePreset',
    'deliveryDate','logisticType','address'];
  item_keys text[] := array['id','name','quantity','width_cm','height_cm',
    'measurement_unit','description','notes'];
begin
  if jsonb_typeof(d) is distinct from 'object' or octet_length(d::text) > 4194304
    then return false; end if;
  if not (d ?& keys) or d - keys <> '{}'::jsonb then return false; end if;
  for k, lim in select * from (values
    ('saleNumber',100),('clientName',250),('commercialNotes',4000),
    ('artInstructions',8000),('deliveryDate',10),('address',2000)
  ) as limits(field, max_len) loop
    if jsonb_typeof(d->k) <> 'string' or length(d->>k) > lim then return false; end if;
  end loop;
  if jsonb_typeof(d->'isUrgent') <> 'boolean' then return false; end if;
  if d->'artDirectionTag' <> 'null'::jsonb
    and (jsonb_typeof(d->'artDirectionTag') <> 'string' or
      d->>'artDirectionTag' not in ('ARTE_PRONTA_EDICAO','CRIACAO_ARTE'))
    then return false; end if;
  if d->'deadlinePreset' <> 'null'::jsonb
    and (jsonb_typeof(d->'deadlinePreset') <> 'string' or
      d->>'deadlinePreset' not in ('FAST_5_8','STANDARD_8_12','STRUCTURE_INSTALL_15_25','CUSTOM'))
    then return false; end if;
  if d->'logisticType' <> 'null'::jsonb
    and (jsonb_typeof(d->'logisticType') <> 'string' or
      d->>'logisticType' not in ('retirada','entrega','instalacao'))
    then return false; end if;
  if jsonb_typeof(d->'items') <> 'array' then return false; end if;
  if jsonb_array_length(d->'items') > 100 then return false; end if;

  for i in select value from jsonb_array_elements(d->'items') loop
    if jsonb_typeof(i) <> 'object' then return false; end if;
    if not (i ?& item_keys) or i - item_keys <> '{}'::jsonb then return false; end if;
    if jsonb_typeof(i->'id') <> 'string' or
      i->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then return false; end if;
    item_id := (i->>'id')::uuid;
    if item_id = any(seen) then return false; end if;
    seen := array_append(seen,item_id);
    for k, lim in select * from (values
      ('name',160),('description',4000),('notes',4000)
    ) as limits(field, max_len) loop
      if jsonb_typeof(i->k) <> 'string' or length(i->>k) > lim then return false; end if;
    end loop;
    if jsonb_typeof(i->'measurement_unit') <> 'string'
      or i->>'measurement_unit' not in ('cm','m') then return false; end if;
    if jsonb_typeof(i->'quantity') not in ('string','number') then return false; end if;
    foreach k in array array['quantity','width_cm','height_cm'] loop
      if jsonb_typeof(i->k) not in ('string','number','null')
        or (jsonb_typeof(i->k) = 'string' and length(i->>k) > 32)
        then return false; end if;
    end loop;
  end loop;
  return true;
end;
$$;
revoke all on function commercial_briefing_private.valid_draft(jsonb) from public, anon, authenticated;

-- Conservative server-side commercial comparison. Ignore internal fields
-- and irrelevant address/date. Keep raw values (representation changes can
-- invalidate a confirmation). Never use a client-supplied revision or key.
create function commercial_briefing_private.terms(d jsonb)
returns jsonb language sql immutable set search_path = ''
as $$
  select (d - array['saleNumber','artInstructions','isUrgent','items','deliveryDate','address'])
    || jsonb_build_object(
      'items', coalesce((select jsonb_agg(value - array['id','notes'] order by ord)
        from jsonb_array_elements(d->'items') with ordinality as item(value,ord)), '[]'::jsonb),
      'deliveryDate', case when d->>'deadlinePreset' = 'CUSTOM' then d->'deliveryDate' else '""'::jsonb end,
      'address', case when d->>'logisticType' = 'retirada' then '""'::jsonb else d->'address' end
    );
$$;
revoke all on function commercial_briefing_private.terms(jsonb) from public, anon, authenticated;

create table public.commercial_briefings (
  id uuid primary key,
  consultant_id uuid not null,
  digisac_contact_id text not null check (length(btrim(digisac_contact_id)) between 1 and 200),
  digisac_ticket_id text check (digisac_ticket_id is null or length(btrim(digisac_ticket_id)) between 1 and 200),
  -- External identifiers are unverified references until a trusted integration binds them.
  context_verified_at timestamptz,
  schema_version integer not null default 1 check (schema_version = 1),
  revision integer not null default 1 check (revision >= 1),
  commercial_revision integer not null default 1 check (commercial_revision between 1 and revision),
  draft jsonb not null check (commercial_briefing_private.valid_draft(draft)),
  confirmation jsonb check (confirmation is null or jsonb_typeof(confirmation) = 'object'),
  os_id uuid unique references public.os_orders(id) on delete restrict,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index commercial_briefings_owner_contact_idx
  on public.commercial_briefings (consultant_id, digisac_contact_id, updated_at desc);
create index commercial_briefings_contact_idx
  on public.commercial_briefings (digisac_contact_id, updated_at desc);

-- Revision metadata, not duplicated copies of personal/commercial content.
create table public.commercial_briefing_revisions (
  briefing_id uuid not null references public.commercial_briefings(id) on delete restrict,
  revision integer not null check (revision >= 1),
  commercial_revision integer not null check (commercial_revision between 1 and revision),
  event text not null check (event in ('CREATED','SAVED','CANCELLED')),
  actor_id uuid not null,
  occurred_at timestamptz not null default now(),
  primary key (briefing_id, revision)
);

alter table public.commercial_briefings enable row level security;
alter table public.commercial_briefing_revisions enable row level security;
revoke all on public.commercial_briefings, public.commercial_briefing_revisions
  from public, anon, authenticated;
grant select on public.commercial_briefings, public.commercial_briefing_revisions to authenticated;

create policy commercial_briefing_read on public.commercial_briefings
for select to authenticated using (
  (select commercial_briefing_private.actor_role()) = 'gerente'
  or ((select commercial_briefing_private.actor_role()) = 'consultor_vendas'
    and consultant_id = (select auth.uid()))
);
create policy commercial_briefing_revision_read on public.commercial_briefing_revisions
for select to authenticated using (
  exists (select 1 from public.commercial_briefings b where b.id = briefing_id)
);

-- No INSERT/UPDATE/DELETE policies or grants for clients. The narrowly
-- scoped private writers below own all metadata and enforce revision CAS.
create function commercial_briefing_private.create_draft(
  p_id uuid, p_contact_id text, p_ticket_id text, p_draft jsonb
) returns public.commercial_briefings
language plpgsql security definer set search_path = ''
as $$
declare
  u uuid := auth.uid();
  r public.commercial_briefings;
  contact_id text := btrim(p_contact_id);
  ticket_id text := nullif(btrim(p_ticket_id),'');
begin
  if u is null or commercial_briefing_private.actor_role() is null
    then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  if p_id is null or contact_id is null or length(contact_id) not between 1 and 200
    or length(ticket_id) > 200 or not commercial_briefing_private.valid_draft(p_draft)
    then raise exception 'Rascunho inválido.' using errcode = '22023'; end if;
  insert into public.commercial_briefings(id,consultant_id,digisac_contact_id,digisac_ticket_id,draft)
    values(p_id,u,contact_id,ticket_id,p_draft) on conflict (id) do nothing returning * into r;
  if found then
    insert into public.commercial_briefing_revisions(briefing_id,revision,commercial_revision,event,actor_id)
      values(r.id,r.revision,r.commercial_revision,'CREATED',u);
    return r;
  end if;
  -- Retry with the same UUID is idempotent and never overwrites newer data.
  select * into r from public.commercial_briefings b where b.id = p_id and b.consultant_id = u
    and b.digisac_contact_id = contact_id and b.digisac_ticket_id is not distinct from ticket_id;
  if not found then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  return r;
end;
$$;

create function commercial_briefing_private.save_draft(
  p_id uuid, p_expected_revision integer, p_draft jsonb
) returns public.commercial_briefings
language plpgsql security definer set search_path = ''
as $$
declare
  u uuid := auth.uid();
  r public.commercial_briefings;
  changed boolean;
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
  update public.commercial_briefings b set
    draft = p_draft, revision = r.revision + 1,
    commercial_revision = r.commercial_revision + case when changed then 1 else 0 end,
    confirmation = case when changed then null else r.confirmation end,
    updated_at = now()
    where b.id = r.id returning * into r;
  insert into public.commercial_briefing_revisions(briefing_id,revision,commercial_revision,event,actor_id)
    values(r.id,r.revision,r.commercial_revision,'SAVED',u);
  return r;
end;
$$;

create function commercial_briefing_private.cancel_draft(
  p_id uuid, p_expected_revision integer
) returns public.commercial_briefings
language plpgsql security definer set search_path = ''
as $$
declare
  u uuid := auth.uid();
  r public.commercial_briefings;
begin
  if u is null or commercial_briefing_private.actor_role() is null
    then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  select * into r from public.commercial_briefings b where b.id = p_id and b.consultant_id = u for update;
  if not found then raise exception 'Acesso negado.' using errcode = '42501'; end if;
  if p_expected_revision is distinct from r.revision
    then raise exception 'Revisão desatualizada.' using errcode = '40001'; end if;
  if r.os_id is not null then raise exception 'Briefing convertido.' using errcode = '22023'; end if;
  if r.cancelled_at is not null then return r; end if;
  update public.commercial_briefings b set cancelled_at = now(), revision = r.revision + 1,
    updated_at = now() where b.id = r.id returning * into r;
  insert into public.commercial_briefing_revisions(briefing_id,revision,commercial_revision,event,actor_id)
    values(r.id,r.revision,r.commercial_revision,'CANCELLED',u);
  return r;
end;
$$;

revoke all on function commercial_briefing_private.create_draft(uuid,text,text,jsonb),
  commercial_briefing_private.save_draft(uuid,integer,jsonb),
  commercial_briefing_private.cancel_draft(uuid,integer) from public, anon, authenticated;
grant execute on function commercial_briefing_private.create_draft(uuid,text,text,jsonb),
  commercial_briefing_private.save_draft(uuid,integer,jsonb),
  commercial_briefing_private.cancel_draft(uuid,integer) to authenticated;

-- Exposed wrappers are invoker functions, not privileged functions.
-- Keep commercial_briefing_private OUT of PostgREST's exposed schemas.
create function public.commercial_briefing_create(p_id uuid,p_contact_id text,p_ticket_id text,p_draft jsonb)
returns public.commercial_briefings language sql security invoker set search_path = ''
as $$ select * from commercial_briefing_private.create_draft(p_id,p_contact_id,p_ticket_id,p_draft); $$;
create function public.commercial_briefing_save(p_id uuid,p_expected_revision integer,p_draft jsonb)
returns public.commercial_briefings language sql security invoker set search_path = ''
as $$ select * from commercial_briefing_private.save_draft(p_id,p_expected_revision,p_draft); $$;
create function public.commercial_briefing_cancel(p_id uuid,p_expected_revision integer)
returns public.commercial_briefings language sql security invoker set search_path = ''
as $$ select * from commercial_briefing_private.cancel_draft(p_id,p_expected_revision); $$;

revoke all on function public.commercial_briefing_create(uuid,text,text,jsonb),
  public.commercial_briefing_save(uuid,integer,jsonb),
  public.commercial_briefing_cancel(uuid,integer) from public, anon, authenticated;
grant execute on function public.commercial_briefing_create(uuid,text,text,jsonb),
  public.commercial_briefing_save(uuid,integer,jsonb),
  public.commercial_briefing_cancel(uuid,integer) to authenticated;

-- Pre-commit checks; no business rows inserted.
do $verify$
declare
  d jsonb := '{"saleNumber":"","clientName":"","items":[],"commercialNotes":"","artInstructions":"","artDirectionTag":null,"isUrgent":false,"deadlinePreset":null,"deliveryDate":"","logisticType":null,"address":""}'::jsonb;
begin
  if not commercial_briefing_private.valid_draft(d)
     or commercial_briefing_private.valid_draft(d || '{"owner":"injected"}'::jsonb)
     or commercial_briefing_private.valid_draft(d || '{"deadlinePreset":"INVALID"}'::jsonb) then
    raise exception 'Briefing validation contract failed';
  end if;
  if commercial_briefing_private.terms(d) is distinct from commercial_briefing_private.terms(d || '{"artInstructions":"internal"}'::jsonb)
     or commercial_briefing_private.terms(d) is not distinct from commercial_briefing_private.terms(d || '{"deadlinePreset":"FAST_5_8"}'::jsonb) then
    raise exception 'Briefing revision contract failed';
  end if;
  if has_table_privilege('anon','public.commercial_briefings','SELECT')
     or has_table_privilege('authenticated','public.commercial_briefings','INSERT')
     or has_table_privilege('authenticated','public.commercial_briefings','UPDATE')
     or has_table_privilege('authenticated','public.commercial_briefings','DELETE')
     or has_table_privilege('authenticated','public.commercial_briefing_revisions','INSERT')
     or has_function_privilege('anon','public.commercial_briefing_create(uuid,text,text,jsonb)','EXECUTE') then
    raise exception 'Briefing access contract failed';
  end if;
end;
$verify$;

commit;
