-- Acesso granular às áreas operacionais; hub_os continua sendo a permissão-base.
insert into public.app_modules (module_key, label, route_prefixes)
values
  ('hub_os_dashboard', 'Dashboard Operacional', '["/hub-os"]'::jsonb),
  ('hub_os_arte', 'Quadro de Arte', '["/os/arte"]'::jsonb),
  ('hub_os_producao', 'Quadro de Produção', '["/os/producao"]'::jsonb)
on conflict (module_key) do update
  set label = excluded.label, route_prefixes = excluded.route_prefixes;

update public.app_modules
set label = 'Ordens de Serviço', route_prefixes = '["/os"]'::jsonb
where module_key = 'hub_os';

-- Apenas gerentes recebem Dashboard automaticamente. Arte e Produção mantêm
-- seus quadros respectivos. Consultores permanecem apenas com a Central de OS.
insert into public.user_module_access (user_id, module_key)
select access.user_id, extra.module_key
from public.user_module_access access
join public.profiles p on p.id = access.user_id
cross join (
  values
    ('hub_os_dashboard'::text, array['gerente', 'admin']::text[]),
    ('hub_os_arte'::text, array['gerente', 'admin', 'arte_finalista']::text[]),
    ('hub_os_producao'::text, array['gerente', 'admin', 'producao', 'instalador']::text[])
) as extra(module_key, eligible_roles)
where access.module_key = 'hub_os'
  and p.role = any(extra.eligible_roles)
on conflict (user_id, module_key) do nothing;
