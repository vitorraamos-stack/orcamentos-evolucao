-- Hub OS roles migration
-- Normalizes legacy roles and constrains profiles.role to Hub OS roles.

update public.profiles
set role = 'gerente'
where role = 'admin';

update public.profiles
set role = 'consultor_vendas'
where role = 'consultor';

update public.profiles
set role = 'consultor_vendas'
where role is null
   or role not in ('consultor_vendas', 'arte_finalista', 'producao', 'instalador', 'gerente');

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('consultor_vendas', 'arte_finalista', 'producao', 'instalador', 'gerente'));

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role in ('admin', 'gerente')
  );
$$;

grant execute on function public.is_admin(uuid) to authenticated;
