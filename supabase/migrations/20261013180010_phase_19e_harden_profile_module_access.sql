-- 19E: server-only user access administration; do not modify profile or access rows.
do $guard$
begin
  if to_regclass('public.profiles') is null
     or to_regprocedure('public.set_user_modules(uuid,text[])') is null then
    raise exception '19E_ABORTED_MISSING_SECURITY_OBJECT';
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'profiles' and c.relrowsecurity
  ) then
    raise exception '19E_ABORTED_PROFILES_RLS_DISABLED';
  end if;

  if (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'profiles'
        and policyname in ('Acesso de Edição',
                           'Apenas admins podem atualizar perfis',
                           'Permitir atualizar perfis',
                           'Permitir inserir perfil')) <> 4
  then
    raise exception '19E_ABORTED_PROFILE_POLICIES_CHANGED';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and cmd in ('ALL','INSERT','UPDATE','DELETE')
      and policyname not in ('Acesso de Edição',
                             'Apenas admins podem atualizar perfis',
                             'Permitir atualizar perfis',
                             'Permitir inserir perfil')
  ) then
    raise exception '19E_ABORTED_UNEXPECTED_PROFILE_WRITE_POLICY';
  end if;

  if not has_table_privilege('service_role','public.profiles','SELECT')
     or not has_table_privilege('service_role','public.profiles','INSERT')
     or not has_table_privilege('service_role','public.profiles','UPDATE')
     or not has_table_privilege('authenticated','public.profiles','SELECT')
     or not has_function_privilege('service_role','public.set_user_modules(uuid,text[])','EXECUTE') then
    raise exception '19E_ABORTED_EXPECTED_SERVER_OR_CLIENT_ACCESS_MISSING';
  end if;
end;
$guard$;

-- Calls to this SECURITY DEFINER function are server-only via api/admin-users.
revoke execute on function public.set_user_modules(uuid,text[])
  from public, anon, authenticated;
grant execute on function public.set_user_modules(uuid,text[]) to service_role;

-- Authentication and user lists still use SELECT. All profile mutations are server-only.
drop policy "Acesso de Edição" on public.profiles;
drop policy "Apenas admins podem atualizar perfis" on public.profiles;
drop policy "Permitir atualizar perfis" on public.profiles;
drop policy "Permitir inserir perfil" on public.profiles;

revoke insert, update, delete, truncate, references, trigger
  on table public.profiles from public, anon, authenticated;

-- Fail the migration transaction if the effective access matrix is not as intended.
do $assert$
begin
  if has_function_privilege('anon','public.set_user_modules(uuid,text[])','EXECUTE')
     or has_function_privilege('authenticated','public.set_user_modules(uuid,text[])','EXECUTE')
     or not has_function_privilege('service_role','public.set_user_modules(uuid,text[])','EXECUTE') then
    raise exception '19E_ABORTED_MODULE_RPC_ACCESS_CHECK';
  end if;

  if has_table_privilege('anon','public.profiles','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('authenticated','public.profiles','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_column_privilege('authenticated','public.profiles','role','UPDATE')
     or has_column_privilege('authenticated','public.profiles','is_super_admin','UPDATE')
     or not has_table_privilege('authenticated','public.profiles','SELECT')
     or not has_table_privilege('service_role','public.profiles','SELECT,INSERT,UPDATE')
     or exists (select 1 from pg_policies
                where schemaname = 'public' and tablename = 'profiles'
                  and cmd in ('ALL','INSERT','UPDATE','DELETE')) then
    raise exception '19E_ABORTED_PROFILES_ACCESS_CHECK';
  end if;
end;
$assert$;
