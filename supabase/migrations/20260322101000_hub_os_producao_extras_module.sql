insert into public.app_modules (module_key, label, route_prefixes)
values (
  'hub_os_producao_extras',
  'Hub OS - Produção (Extras)',
  '[]'::jsonb
)
on conflict (module_key) do update
set label = excluded.label,
    route_prefixes = excluded.route_prefixes;
