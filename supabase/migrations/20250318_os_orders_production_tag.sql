alter table public.os_orders
  add column if not exists title text,
  add column if not exists production_tag text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'os_orders_production_tag_check'
  ) then
    alter table public.os_orders
      add constraint os_orders_production_tag_check
      check (production_tag in ('EM_PRODUCAO', 'PRONTO'));
  end if;
end $$;
