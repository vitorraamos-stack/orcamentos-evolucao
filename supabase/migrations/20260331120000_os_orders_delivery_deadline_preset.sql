alter table public.os_orders
  add column if not exists delivery_deadline_preset text,
  add column if not exists delivery_deadline_started_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'os_orders_delivery_deadline_preset_check'
  ) then
    alter table public.os_orders
      add constraint os_orders_delivery_deadline_preset_check
      check (
        delivery_deadline_preset is null
        or delivery_deadline_preset in (
          'FAST_5_8',
          'STANDARD_8_12',
          'STRUCTURE_INSTALL_15_25',
          'CUSTOM'
        )
      );
  end if;
end $$;

create index if not exists os_orders_delivery_deadline_preset_idx
  on public.os_orders (delivery_deadline_preset);

create index if not exists os_orders_delivery_deadline_started_at_idx
  on public.os_orders (delivery_deadline_started_at)
  where delivery_deadline_started_at is not null;
