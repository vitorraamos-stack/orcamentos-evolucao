create or replace function public.kiosk_board_register_secure(
  p_source_type text,
  p_source_id uuid,
  p_lookup_code text default null,
  p_actor_id uuid default null,
  p_terminal_id text default null
)
returns public.os_kiosk_board
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

  return public.kiosk_board_register(
    p_source_type,
    p_source_id,
    p_lookup_code,
    v_actor_id,
    p_terminal_id
  );
end;
$$;

create or replace function public.kiosk_board_register_by_code(
  p_lookup_code text,
  p_actor_id uuid default null,
  p_terminal_id text default null
)
returns public.os_kiosk_board
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_source_type text;
  v_source_id uuid;
  v_actor_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.'
      using errcode = 'P0001', detail = 'KIOSK_AUTH_REQUIRED';
  end if;

  v_code := regexp_replace(coalesce(p_lookup_code, ''), '\\D', '', 'g');

  if v_code = '' then
    raise exception 'Código inválido para consulta de OS.'
      using errcode = 'P0001', detail = 'KIOSK_INVALID_CODE';
  end if;

  select 'os', o.id
  into v_source_type, v_source_id
  from public.os o
  where o.os_number = v_code::bigint
  limit 1;

  if not found then
    select 'os', o.id
    into v_source_type, v_source_id
    from public.os o
    where o.sale_number = v_code
    limit 1;
  end if;

  if not found then
    select 'os_orders', oo.id
    into v_source_type, v_source_id
    from public.os_orders oo
    where oo.sale_number = v_code
    limit 1;
  end if;

  if not found then
    raise exception 'OS não encontrada. Verifique o número da etiqueta.'
      using errcode = 'P0001', detail = 'KIOSK_UPSTREAM_NOT_FOUND';
  end if;

  v_actor_id := coalesce(p_actor_id, auth.uid());

  return public.kiosk_board_register(
    v_source_type,
    v_source_id,
    v_code,
    v_actor_id,
    p_terminal_id
  );
end;
$$;

create or replace function public.kiosk_board_move_secure(
  p_order_key text,
  p_action text,
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
  from public.kiosk_board_move(
    p_order_key,
    p_action,
    v_actor_id,
    p_terminal_id
  );
end;
$$;

revoke all on function public.kiosk_board_register_secure(text, uuid, text, uuid, text) from public;
revoke all on function public.kiosk_board_register_by_code(text, uuid, text) from public;
revoke all on function public.kiosk_board_move_secure(text, text, uuid, text) from public;

grant execute on function public.kiosk_board_register_secure(text, uuid, text, uuid, text) to authenticated;
grant execute on function public.kiosk_board_register_by_code(text, uuid, text) to authenticated;
grant execute on function public.kiosk_board_move_secure(text, text, uuid, text) to authenticated;
