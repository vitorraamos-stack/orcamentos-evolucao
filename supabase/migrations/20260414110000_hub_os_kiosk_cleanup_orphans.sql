create or replace function public.kiosk_board_cleanup_orphans(
  p_order_key text default null
)
returns table (
  order_key text,
  removed boolean,
  reason text
)
language plpgsql
as $$
begin
  return query
  with orphan_rows as (
    select kb.order_key, 'upstream_missing'::text as reason
    from public.os_kiosk_board kb
    where (p_order_key is null or kb.order_key = p_order_key)
      and (
        (kb.source_type = 'os' and not exists (
          select 1
          from public.os o
          where o.id = kb.source_id
        ))
        or
        (kb.source_type = 'os_orders' and not exists (
          select 1
          from public.os_orders oo
          where oo.id = kb.source_id
        ))
      )
  ),
  removed_rows as (
    delete from public.os_kiosk_board kb
    using orphan_rows o
    where kb.order_key = o.order_key
    returning kb.order_key
  )
  select o.order_key, true as removed, o.reason
  from orphan_rows o
  join removed_rows r on r.order_key = o.order_key
  order by o.order_key;
end;
$$;

create or replace function public.kiosk_board_cleanup_orphans_secure(
  p_order_key text default null
)
returns table (
  order_key text,
  removed boolean,
  reason text
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

  return query
  select *
  from public.kiosk_board_cleanup_orphans(p_order_key);
end;
$$;

revoke all on function public.kiosk_board_cleanup_orphans(text) from public;
revoke all on function public.kiosk_board_cleanup_orphans_secure(text) from public;

grant execute on function public.kiosk_board_cleanup_orphans_secure(text) to authenticated;
