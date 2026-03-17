create table if not exists public.os_installation_feedbacks (
  id uuid primary key default gen_random_uuid(),
  order_key text not null,
  source_type text not null check (source_type in ('os', 'os_orders')),
  source_id uuid not null,
  os_number bigint null,
  sale_number text null,
  client_name text null,
  title text null,
  feedback text not null,
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  finalized_at timestamptz not null default now(),
  reviewed boolean not null default false,
  reviewed_at timestamptz null,
  reviewed_by uuid null references auth.users(id)
);

create index if not exists os_installation_feedbacks_created_at_desc_idx
  on public.os_installation_feedbacks (created_at desc);

create index if not exists os_installation_feedbacks_reviewed_idx
  on public.os_installation_feedbacks (reviewed);

create index if not exists os_installation_feedbacks_source_idx
  on public.os_installation_feedbacks (source_type, source_id);

create index if not exists os_installation_feedbacks_order_key_idx
  on public.os_installation_feedbacks (order_key);

alter table public.os_installation_feedbacks enable row level security;

drop policy if exists "os_installation_feedbacks_select_authenticated" on public.os_installation_feedbacks;
create policy "os_installation_feedbacks_select_authenticated"
  on public.os_installation_feedbacks
  for select
  to authenticated
  using (true);

drop policy if exists "os_installation_feedbacks_insert_none" on public.os_installation_feedbacks;
create policy "os_installation_feedbacks_insert_none"
  on public.os_installation_feedbacks
  for insert
  to authenticated
  with check (false);

drop policy if exists "os_installation_feedbacks_update_none" on public.os_installation_feedbacks;
create policy "os_installation_feedbacks_update_none"
  on public.os_installation_feedbacks
  for update
  to authenticated
  using (false)
  with check (false);

drop policy if exists "os_installation_feedbacks_delete_none" on public.os_installation_feedbacks;
create policy "os_installation_feedbacks_delete_none"
  on public.os_installation_feedbacks
  for delete
  to authenticated
  using (false);

create or replace function public.kiosk_board_complete_installation(
  p_order_key text,
  p_feedback text,
  p_actor_id uuid default null,
  p_terminal_id text default null
)
returns table (
  id uuid,
  order_key text,
  source_type text,
  source_id uuid,
  os_number bigint,
  sale_number text,
  client_name text,
  title text,
  description text,
  address text,
  delivery_date date,
  delivery_mode text,
  production_tag text,
  upstream_status text,
  current_stage text,
  material_ready boolean,
  terminal_id text,
  last_lookup_code text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  removed boolean,
  result_code text,
  result_message text
)
language plpgsql
as $$
declare
  v_card public.os_kiosk_board;
  v_previous_upstream_status text;
  v_feedback text;
  v_final_status text := 'Finalizados';
begin
  v_feedback := btrim(coalesce(p_feedback, ''));

  if v_feedback = '' then
    raise exception 'Feedback obrigatório para finalizar instalação.'
      using errcode = 'P0001', detail = 'KIOSK_FEEDBACK_REQUIRED';
  end if;

  select * into v_card
  from public.os_kiosk_board kb
  where kb.order_key = p_order_key
  for update;

  if not found then
    raise exception 'Card do quiosque não encontrado.'
      using errcode = 'P0001', detail = 'KIOSK_CARD_NOT_FOUND';
  end if;

  if v_card.current_stage <> 'instalacoes' then
    raise exception 'A OS não está na etapa de Instalações.'
      using errcode = 'P0001', detail = 'KIOSK_INVALID_STAGE';
  end if;

  v_previous_upstream_status := v_card.upstream_status;

  if v_card.source_type = 'os' then
    update public.os o
      set status_producao = v_final_status,
          updated_at = now()
    where o.id = v_card.source_id
    returning
      o.os_number,
      o.sale_number,
      coalesce(nullif(o.client_name, ''), o.customer_name),
      o.title,
      coalesce(o.description, o.notes),
      o.address,
      o.delivery_date,
      o.delivery_type,
      o.status_producao
    into
      v_card.os_number,
      v_card.sale_number,
      v_card.client_name,
      v_card.title,
      v_card.description,
      v_card.address,
      v_card.delivery_date,
      v_card.delivery_mode,
      v_card.upstream_status;

    if not found then
      raise exception 'Entidade upstream não encontrada para finalização.'
        using errcode = 'P0001', detail = 'KIOSK_UPSTREAM_NOT_FOUND';
    end if;

    insert into public.os_event (os_id, type, payload, created_by, created_at)
    values (
      v_card.source_id,
      'status_producao_changed',
      jsonb_build_object(
        'from', v_previous_upstream_status,
        'to', v_final_status,
        'source', 'kiosk',
        'action', 'complete_installation',
        'feedback', v_feedback,
        'terminal_id', p_terminal_id
      ),
      p_actor_id,
      now()
    );
  else
    update public.os_orders oo
      set prod_status = v_final_status,
          production_tag = coalesce(oo.production_tag, 'PRONTO'),
          updated_at = now(),
          updated_by = coalesce(p_actor_id, oo.updated_by)
    where oo.id = v_card.source_id
    returning
      oo.os_number,
      oo.sale_number,
      oo.client_name,
      oo.title,
      oo.description,
      oo.address,
      oo.delivery_date,
      oo.logistic_type,
      oo.production_tag,
      oo.prod_status
    into
      v_card.os_number,
      v_card.sale_number,
      v_card.client_name,
      v_card.title,
      v_card.description,
      v_card.address,
      v_card.delivery_date,
      v_card.delivery_mode,
      v_card.production_tag,
      v_card.upstream_status;

    if not found then
      raise exception 'Entidade upstream não encontrada para finalização.'
        using errcode = 'P0001', detail = 'KIOSK_UPSTREAM_NOT_FOUND';
    end if;

    insert into public.os_orders_event (os_id, type, payload, created_by, created_at)
    values (
      v_card.source_id,
      'prod_status_changed',
      jsonb_build_object(
        'from', v_previous_upstream_status,
        'to', v_final_status,
        'source', 'kiosk',
        'action', 'complete_installation',
        'feedback', v_feedback,
        'terminal_id', p_terminal_id
      ),
      p_actor_id,
      now()
    );
  end if;

  insert into public.os_installation_feedbacks (
    order_key,
    source_type,
    source_id,
    os_number,
    sale_number,
    client_name,
    title,
    feedback,
    created_by,
    finalized_at
  ) values (
    v_card.order_key,
    v_card.source_type,
    v_card.source_id,
    v_card.os_number,
    v_card.sale_number,
    v_card.client_name,
    v_card.title,
    v_feedback,
    p_actor_id,
    now()
  );

  delete from public.os_kiosk_board kb
  where kb.order_key = p_order_key;

  return query
  select
    v_card.id,
    v_card.order_key,
    v_card.source_type,
    v_card.source_id,
    v_card.os_number,
    v_card.sale_number,
    v_card.client_name,
    v_card.title,
    v_card.description,
    v_card.address,
    v_card.delivery_date,
    v_card.delivery_mode,
    v_card.production_tag,
    v_final_status,
    v_card.current_stage,
    v_card.material_ready,
    coalesce(p_terminal_id, v_card.terminal_id),
    v_card.last_lookup_code,
    v_card.created_by,
    coalesce(p_actor_id, v_card.updated_by),
    v_card.created_at,
    now(),
    true,
    'installation_completed',
    'Instalação finalizada com feedback e removida do quiosque';
end;
$$;

create or replace function public.kiosk_board_complete_installation_secure(
  p_order_key text,
  p_feedback text,
  p_actor_id uuid default null,
  p_terminal_id text default null
)
returns table (
  id uuid,
  order_key text,
  source_type text,
  source_id uuid,
  os_number bigint,
  sale_number text,
  client_name text,
  title text,
  description text,
  address text,
  delivery_date date,
  delivery_mode text,
  production_tag text,
  upstream_status text,
  current_stage text,
  material_ready boolean,
  terminal_id text,
  last_lookup_code text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  removed boolean,
  result_code text,
  result_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.'
      using errcode = 'P0001', detail = 'KIOSK_AUTH_REQUIRED';
  end if;

  v_actor_id := coalesce(p_actor_id, auth.uid());

  return query
  select *
  from public.kiosk_board_complete_installation(
    p_order_key,
    p_feedback,
    v_actor_id,
    p_terminal_id
  );
end;
$$;

create or replace function public.installation_feedbacks_list_secure()
returns table (
  id uuid,
  order_key text,
  source_type text,
  source_id uuid,
  os_number bigint,
  sale_number text,
  client_name text,
  title text,
  feedback text,
  created_by uuid,
  created_at timestamptz,
  finalized_at timestamptz,
  reviewed boolean,
  reviewed_at timestamptz,
  reviewed_by uuid,
  reviewed_by_email text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.'
      using errcode = 'P0001', detail = 'KIOSK_AUTH_REQUIRED';
  end if;

  if not public.is_admin(auth.uid()) then
    raise exception 'Sem permissão para consultar feedbacks de instalação.'
      using errcode = 'P0001', detail = 'KIOSK_MANAGER_REQUIRED';
  end if;

  return query
  select
    f.id,
    f.order_key,
    f.source_type,
    f.source_id,
    f.os_number,
    f.sale_number,
    f.client_name,
    f.title,
    f.feedback,
    f.created_by,
    f.created_at,
    f.finalized_at,
    f.reviewed,
    f.reviewed_at,
    f.reviewed_by,
    p.email as reviewed_by_email
  from public.os_installation_feedbacks f
  left join public.profiles p on p.id = f.reviewed_by
  order by f.created_at desc;
end;
$$;

revoke all on function public.kiosk_board_complete_installation(text, text, uuid, text) from public;
revoke all on function public.kiosk_board_complete_installation_secure(text, text, uuid, text) from public;
revoke all on function public.installation_feedbacks_list_secure() from public;

grant execute on function public.kiosk_board_complete_installation_secure(text, text, uuid, text) to authenticated;
grant execute on function public.installation_feedbacks_list_secure() to authenticated;
