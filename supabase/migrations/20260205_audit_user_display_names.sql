-- Expose user display names for Hub OS audit screens.
-- Needed because public.profiles currently stores only email/role,
-- while full names live in auth.users raw_user_meta_data.

create or replace function public.get_user_display_names(user_ids uuid[])
returns table (
  id uuid,
  full_name text,
  email text
)
language sql
security definer
set search_path = public, auth
stable
as $$
  select
    u.id,
    coalesce(
      nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
      nullif(trim(coalesce(u.raw_user_meta_data ->> 'name', '')), ''),
      nullif(trim(coalesce(p.email, '')), ''),
      nullif(trim(coalesce(u.email, '')), '')
    ) as full_name,
    coalesce(p.email, u.email) as email
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = any(user_ids);
$$;

grant execute on function public.get_user_display_names(uuid[]) to authenticated;
