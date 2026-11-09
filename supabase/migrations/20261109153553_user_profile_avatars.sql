-- User profile avatars: separate private storage from operational/financial documents.
-- Apply only with an authorized database rollout. No existing data is modified.
create table if not exists public.profile_avatars (
  user_id uuid primary key references auth.users(id) on delete cascade,
  storage_path text not null,
  updated_at timestamptz not null default now(),
  constraint profile_avatars_path_format check (
    storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
    and split_part(storage_path, '/', 1) = user_id::text
  )
);

alter table public.profile_avatars enable row level security;
revoke all on public.profile_avatars from anon;
grant select, insert, update, delete on public.profile_avatars to authenticated;

drop policy if exists profile_avatars_read on public.profile_avatars;
create policy profile_avatars_read on public.profile_avatars
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_manager((select auth.uid())));

drop policy if exists profile_avatars_create on public.profile_avatars;
create policy profile_avatars_create on public.profile_avatars
  for insert to authenticated
  with check (user_id = (select auth.uid()) or public.is_manager((select auth.uid())));

drop policy if exists profile_avatars_update on public.profile_avatars;
create policy profile_avatars_update on public.profile_avatars
  for update to authenticated
  using (user_id = (select auth.uid()) or public.is_manager((select auth.uid())))
  with check (user_id = (select auth.uid()) or public.is_manager((select auth.uid())));

drop policy if exists profile_avatars_remove on public.profile_avatars;
create policy profile_avatars_remove on public.profile_avatars
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_manager((select auth.uid())));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-avatars', 'user-avatars', false, 1048576, array['image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists user_avatars_read on storage.objects;
create policy user_avatars_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'user-avatars' and
    (split_part(name, '/', 1) = (select auth.uid())::text or public.is_manager((select auth.uid())))
  );

drop policy if exists user_avatars_upload on storage.objects;
create policy user_avatars_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'user-avatars' and
    name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$' and
    (split_part(name, '/', 1) = (select auth.uid())::text or public.is_manager((select auth.uid())))
  );

drop policy if exists user_avatars_remove on storage.objects;
create policy user_avatars_remove on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'user-avatars' and
    (split_part(name, '/', 1) = (select auth.uid())::text or public.is_manager((select auth.uid())))
  );
