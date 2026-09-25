-- Phase 2.1: auth.users display-name lookup is restricted to Hub OS users.
create or replace function public.get_user_display_names(user_ids uuid[])
returns table (id uuid, full_name text, email text)
language sql
security definer
set search_path = public, auth
stable
as $$
  select u.id,
    coalesce(nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''), nullif(trim(coalesce(u.raw_user_meta_data ->> 'name', '')), ''), nullif(trim(coalesce(p.email, '')), ''), nullif(trim(coalesce(u.email, '')), '')),
    coalesce(p.email, u.email)
  from auth.users u left join public.profiles p on p.id = u.id
  where public.has_module_access(auth.uid(), 'hub_os') and u.id = any(user_ids);
$$;

revoke execute on function public.get_user_display_names(uuid[]) from public;
revoke execute on function public.get_user_display_names(uuid[]) from anon;
grant execute on function public.get_user_display_names(uuid[]) to authenticated;

-- Validation after applying:
-- select has_function_privilege('anon', 'public.get_user_display_names(uuid[])', 'execute'); -- false
-- select has_function_privilege('authenticated', 'public.get_user_display_names(uuid[])', 'execute'); -- true
