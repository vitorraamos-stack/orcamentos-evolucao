insert into public.app_modules (module_key, label, route_prefixes)
values (
  'hub_os_kiosk',
  'Quiosque (Acabamento)',
  '["/os/kiosk"]'::jsonb
)
on conflict (module_key) do update
set label = excluded.label,
    route_prefixes = excluded.route_prefixes;

insert into public.user_module_access (user_id, module_key)
select p.id, 'hub_os_kiosk'
from public.profiles p
where p.role in ('gerente', 'admin')
on conflict (user_id, module_key) do nothing;
