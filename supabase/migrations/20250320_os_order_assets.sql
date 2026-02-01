-- OS order assets storage and processing jobs
create table if not exists public.os_order_asset_jobs (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.os_orders(id) on delete cascade,
  status text not null check (status in ('UPLOADING','PENDING','PROCESSING','DONE','DONE_CLEANUP_FAILED','CLEANED','ERROR')),
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  processing_started_at timestamptz null,
  completed_at timestamptz null,
  cleaned_at timestamptz null,
  destination_path text null,
  last_error text null,
  attempt_count int not null default 0
);

create table if not exists public.os_order_assets (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.os_orders(id) on delete cascade,
  job_id uuid null references public.os_order_asset_jobs(id) on delete set null,
  bucket text not null default 'os-artes',
  object_path text not null,
  original_name text not null,
  mime_type text null,
  size_bytes bigint not null,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz default now(),
  synced_at timestamptz null,
  deleted_from_storage_at timestamptz null,
  error text null
);

create index if not exists os_order_assets_os_id_idx on public.os_order_assets (os_id);
create index if not exists os_order_assets_job_id_idx on public.os_order_assets (job_id);
create index if not exists os_order_assets_uploaded_at_idx on public.os_order_assets (uploaded_at desc);

create index if not exists os_order_asset_jobs_os_id_idx on public.os_order_asset_jobs (os_id);
create index if not exists os_order_asset_jobs_status_idx on public.os_order_asset_jobs (status);
create index if not exists os_order_asset_jobs_created_at_idx on public.os_order_asset_jobs (created_at desc);

alter table public.os_order_asset_jobs enable row level security;
alter table public.os_order_assets enable row level security;

drop trigger if exists os_order_asset_jobs_set_updated_at on public.os_order_asset_jobs;
create trigger os_order_asset_jobs_set_updated_at
  before update on public.os_order_asset_jobs
  for each row execute procedure public.set_updated_at_timestamp();

drop policy if exists "os_order_asset_jobs_select_authenticated" on public.os_order_asset_jobs;
create policy "os_order_asset_jobs_select_authenticated"
  on public.os_order_asset_jobs
  for select
  to authenticated
  using (true);

drop policy if exists "os_order_asset_jobs_insert_authenticated" on public.os_order_asset_jobs;
create policy "os_order_asset_jobs_insert_authenticated"
  on public.os_order_asset_jobs
  for insert
  to authenticated
  with check (auth.uid() is not null);

drop policy if exists "os_order_asset_jobs_update_authenticated" on public.os_order_asset_jobs;
create policy "os_order_asset_jobs_update_authenticated"
  on public.os_order_asset_jobs
  for update
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "os_order_asset_jobs_delete_admin" on public.os_order_asset_jobs;
create policy "os_order_asset_jobs_delete_admin"
  on public.os_order_asset_jobs
  for delete
  to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "os_order_assets_select_authenticated" on public.os_order_assets;
create policy "os_order_assets_select_authenticated"
  on public.os_order_assets
  for select
  to authenticated
  using (true);

drop policy if exists "os_order_assets_insert_authenticated" on public.os_order_assets;
create policy "os_order_assets_insert_authenticated"
  on public.os_order_assets
  for insert
  to authenticated
  with check (auth.uid() is not null);

drop policy if exists "os_order_assets_update_authenticated" on public.os_order_assets;
create policy "os_order_assets_update_authenticated"
  on public.os_order_assets
  for update
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "os_order_assets_delete_admin" on public.os_order_assets;
create policy "os_order_assets_delete_admin"
  on public.os_order_assets
  for delete
  to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "os_artes_objects_select_authenticated" on storage.objects;
create policy "os_artes_objects_select_authenticated"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'os-artes' and auth.uid() is not null);

drop policy if exists "os_artes_objects_insert_authenticated" on storage.objects;
create policy "os_artes_objects_insert_authenticated"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'os-artes' and auth.uid() is not null);
