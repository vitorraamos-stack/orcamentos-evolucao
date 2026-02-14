-- Migrate legacy production extras module into the new split modules.
insert into public.user_module_access (user_id, module_key)
select uma.user_id, 'hub_os_insumos'
from public.user_module_access uma
where uma.module_key = 'hub_os_producao_extras'
on conflict (user_id, module_key) do nothing;

insert into public.user_module_access (user_id, module_key)
select uma.user_id, 'hub_os_producao_externa'
from public.user_module_access uma
where uma.module_key = 'hub_os_producao_extras'
on conflict (user_id, module_key) do nothing;

delete from public.user_module_access
where module_key = 'hub_os_producao_extras';

delete from public.app_modules
where module_key = 'hub_os_producao_extras';
