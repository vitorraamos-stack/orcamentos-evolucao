alter table public.os_orders
  add column if not exists insumos_details text,
  add column if not exists insumos_return_notes text,
  add column if not exists insumos_requested_at timestamptz,
  add column if not exists insumos_resolved_at timestamptz,
  add column if not exists insumos_resolved_by uuid;

alter table public.os_orders
  drop constraint if exists os_orders_production_tag_check;

alter table public.os_orders
  add constraint os_orders_production_tag_check
  check (
    production_tag is null
    or production_tag in (
      'EM_PRODUCAO',
      'PRONTO',
      'AGUARDANDO_INSUMOS',
      'PRODUCAO_EXTERNA'
    )
  );

insert into public.app_modules (module_key, label, route_prefixes)
values
  ('hub_os_insumos', 'Hub OS - Aguardando Insumos', '[]'::jsonb),
  ('hub_os_producao_externa', 'Hub OS - Produção Externa', '[]'::jsonb)
on conflict (module_key) do update
set label = excluded.label,
    route_prefixes = excluded.route_prefixes;
