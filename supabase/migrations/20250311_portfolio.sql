-- Portfolio gallery for references
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.portfolio_photos (
  id uuid primary key default gen_random_uuid(),
  material_id uuid null references public.materials(id),
  material_name text null,
  caption text not null default '',
  tags text[] not null default '{}'::text[],
  original_path text not null,
  thumb_path text null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists portfolio_photos_created_at_idx on public.portfolio_photos (created_at desc);
create index if not exists portfolio_photos_material_id_idx on public.portfolio_photos (material_id);
create index if not exists portfolio_photos_tags_gin on public.portfolio_photos using gin (tags);
create index if not exists portfolio_photos_caption_trgm on public.portfolio_photos using gin (caption gin_trgm_ops);

create or replace function public.set_portfolio_photos_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists portfolio_photos_set_updated_at on public.portfolio_photos;
create trigger portfolio_photos_set_updated_at
  before update on public.portfolio_photos
  for each row execute procedure public.set_portfolio_photos_updated_at();

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$$;

grant execute on function public.is_admin(uuid) to authenticated;

alter table public.portfolio_photos enable row level security;

create policy "portfolio_photos_select_authenticated"
  on public.portfolio_photos
  for select
  to authenticated
  using (auth.uid() is not null);

create policy "portfolio_photos_insert_admin"
  on public.portfolio_photos
  for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

create policy "portfolio_photos_update_admin"
  on public.portfolio_photos
  for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "portfolio_photos_delete_admin"
  on public.portfolio_photos
  for delete
  to authenticated
  using (public.is_admin(auth.uid()));

-- Storage policies for bucket 'portfolio'
create policy "portfolio_objects_select_authenticated"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'portfolio' and auth.uid() is not null);

create policy "portfolio_objects_insert_admin"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'portfolio' and public.is_admin(auth.uid()));

create policy "portfolio_objects_update_admin"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'portfolio' and public.is_admin(auth.uid()))
  with check (bucket_id = 'portfolio' and public.is_admin(auth.uid()));

create policy "portfolio_objects_delete_admin"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'portfolio' and public.is_admin(auth.uid()));
