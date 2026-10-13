do $$
begin
  if exists (select 1 from public.quotes limit 1) then
    raise exception 'QUOTE_CLEANUP_ABORTED_QUOTES_NOT_EMPTY';
  end if;

  if exists (select 1 from public.quote_snapshots limit 1) then
    raise exception 'QUOTE_CLEANUP_ABORTED_SNAPSHOTS_NOT_EMPTY';
  end if;

  if exists (select 1 from public.quote_events limit 1) then
    raise exception 'QUOTE_CLEANUP_ABORTED_EVENTS_NOT_EMPTY';
  end if;

  if exists (
    select 1
    from public.os_orders
    where quote_id is not null
       or quote_snapshot_id is not null
       or quote_total is not null
    limit 1
  ) then
    raise exception 'QUOTE_CLEANUP_ABORTED_OS_LINKS_PRESENT';
  end if;
end;
$$;

drop trigger if exists quote_events_guard on public.quote_events;
drop trigger if exists quote_snapshots_guard on public.quote_snapshots;
drop trigger if exists quotes_guard on public.quotes;

alter table public.os_orders
  drop constraint if exists os_orders_quote_snapshot_fkey,
  drop constraint if exists os_orders_quote_id_fkey,
  drop constraint if exists os_orders_quote_link_complete,
  drop constraint if exists os_orders_quote_total_nonnegative;

drop index if exists public.os_orders_quote_id_unique;

do $$
declare
  r record;
begin
  for r in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as arguments
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proname like 'quote\_%' escape '\'
        or p.proname = 'hub_os_create_from_quote_secure'
      )
  loop
    execute format(
      'drop function if exists %I.%I(%s)',
      r.schema_name,
      r.function_name,
      r.arguments
    );
  end loop;
end;
$$;

alter table public.quotes
  drop constraint if exists quotes_current_snapshot_fk;

drop table if exists public.quote_events;
drop table if exists public.quote_snapshots;
drop table if exists public.quotes;

drop sequence if exists public.quote_number_seq;

alter table public.os_orders
  drop column if exists quote_snapshot_id,
  drop column if exists quote_id,
  drop column if exists quote_total;
