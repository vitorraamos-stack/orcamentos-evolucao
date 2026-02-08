alter table public.os_payment_proof
  add column if not exists synced_to_smb_at timestamptz,
  add column if not exists smb_path text;

alter table public.os_payment_proof
  alter column storage_provider set default 'r2';

update public.os_payment_proof
  set storage_provider = 'supabase'
  where attachment_url is not null
    and (storage_provider is null or storage_provider = '');
