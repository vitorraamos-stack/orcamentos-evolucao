-- Módulos individuais do menu EvoluSystem; migration aditiva sem revogação de acesso.
insert into public.app_modules (module_key,label,route_prefixes)
values
 ('hub_os_instalacoes','Instalações','["/instalacoes"]'::jsonb),
 ('hub_os_entregas','Entregas','["/entregas"]'::jsonb),
 ('orcamentista','Orçamentista','["/orcamentista"]'::jsonb),
 ('biblioteca_gestao','Gestão da Biblioteca','["/biblioteca/gestao"]'::jsonb),
 ('precos_custos','Preços e Custos','["/configuracoes/precos"]'::jsonb),
 ('regras_operacionais','Regras Operacionais','["/configuracoes/regras-operacionais"]'::jsonb)
on conflict (module_key) do update
set label=excluded.label,route_prefixes=excluded.route_prefixes;

update public.app_modules
set label='Usuários',route_prefixes='["/configuracoes"]'::jsonb
where module_key='configuracoes';

-- Preservar a visualização de Instalações/Entregas nos perfis anteriormente autorizados.
insert into public.user_module_access (user_id,module_key)
select a.user_id, v.module_key
from public.user_module_access a
join public.profiles p on p.id=a.user_id
cross join (values ('hub_os_instalacoes'::text), ('hub_os_entregas'::text)) v(module_key)
where a.module_key='hub_os'
and p.role in ('gerente','admin','producao','instalador')
on conflict (user_id,module_key) do nothing;

-- Preservar os itens que antes herdavam acesso por outro módulo.
insert into public.user_module_access (user_id,module_key)
select a.user_id, v.target_key
from public.user_module_access a
join public.profiles p on p.id=a.user_id
join (values
 ('calculadora'::text,'orcamentista'::text),
 ('biblioteca_produtos'::text,'biblioteca_gestao'::text),
 ('configuracoes'::text,'precos_custos'::text),
 ('configuracoes'::text,'regras_operacionais'::text)
) v(parent_key,target_key) on v.parent_key=a.module_key
where (v.target_key='orcamentista' and p.role in ('gerente','admin','consultor_vendas','consultor'))
or (v.target_key in ('biblioteca_gestao','precos_custos') and p.role in ('gerente','admin'))
or (v.target_key='regras_operacionais' and p.role in ('gerente','admin') and exists (
 select 1 from public.user_module_access h
 where h.user_id=a.user_id and h.module_key='hub_os'
))
on conflict (user_id,module_key) do nothing;

-- Conceder Instalações à consultora específica na Gestão de Usuários após publicação.
-- Nenhuma nova permissão operacional será concedida automaticamente ao perfil comercial.
