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
  v_code_bigint bigint;
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

  begin
    v_code_bigint := v_code::bigint;
  exception
    when others then
      raise exception 'Código inválido para consulta de OS.'
        using errcode = 'P0001', detail = 'KIOSK_INVALID_CODE';
  end;

  -- legado: match forte por os_number, sale_number e title contendo o número isolado
  select 'os', o.id
    into v_source_type, v_source_id
  from public.os o
  where o.os_number = v_code_bigint
     or o.sale_number = v_code
     or regexp_replace(coalesce(o.sale_number, ''), '\\D', '', 'g') = v_code
     or coalesce(o.title, '') ~ ('(^|\\D)' || v_code || '(\\D|$)')
  order by o.updated_at desc nulls last
  limit 1;

  if not found then
    -- fluxo novo: incluir também os_number, além de sale_number e title
    select 'os_orders', oo.id
      into v_source_type, v_source_id
    from public.os_orders oo
    where oo.os_number = v_code_bigint
       or oo.sale_number = v_code
       or regexp_replace(coalesce(oo.sale_number, ''), '\\D', '', 'g') = v_code
       or coalesce(oo.title, '') ~ ('(^|\\D)' || v_code || '(\\D|$)')
    order by oo.updated_at desc nulls last
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
