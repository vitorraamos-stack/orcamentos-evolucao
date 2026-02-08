alter table public.os_orders
  add column if not exists art_direction_tag text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'os_orders_art_direction_tag_check'
  ) then
    alter table public.os_orders
      add constraint os_orders_art_direction_tag_check
      check (art_direction_tag in ('ARTE_PRONTA_EDICAO', 'CRIACAO_ARTE', 'URGENTE'));
  end if;
end $$;
