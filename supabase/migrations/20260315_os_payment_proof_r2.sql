alter table public.os_payment_proof
  add column storage_provider text not null default 'supabase',
  add column storage_bucket text,
  add column r2_etag text,
  add column content_type text,
  add column size_bytes bigint;
