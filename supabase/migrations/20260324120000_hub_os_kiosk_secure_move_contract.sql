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

  if p_action = 'remove_if_finalized' then
    raise exception 'Ação inválida para o quiosque.'
      using errcode = 'P0001', detail = 'KIOSK_INVALID_ACTION';
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
