-- Hub OS roles migration
-- Normalizes legacy roles and constrains profiles.role to Hub OS roles.

-- 1) Drop previous role check first (legacy check usually allowed only admin/consultor).
alter table public.profiles
  drop constraint if exists profiles_role_check;

-- 2) Normalize legacy and invalid/null values.
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

-- 3) Recreate role domain check with Hub OS roles.
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('consultor_vendas', 'arte_finalista', 'producao', 'instalador', 'gerente'));

-- 4) Keep trigger-compatible default for new users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'consultor_vendas')
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

-- 5) Update admin helper: manager is admin-equivalent (plus legacy admin).
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
