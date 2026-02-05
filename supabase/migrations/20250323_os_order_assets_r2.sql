alter table public.os_order_assets
  add column if not exists storage_provider text not null default 'supabase' check (storage_provider in ('supabase', 'r2')),
  add column if not exists storage_bucket text null,
  add column if not exists r2_etag text null;
