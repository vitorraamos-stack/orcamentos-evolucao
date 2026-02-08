alter table public.os_order_assets
  add column asset_type text not null default 'CLIENT_FILE';

alter table public.os_order_assets
  add constraint os_order_assets_asset_type_check
  check (asset_type in ('CLIENT_FILE', 'PAYMENT_PROOF', 'PURCHASE_ORDER'));

create index if not exists os_order_assets_os_id_asset_type_idx
  on public.os_order_assets (os_id, asset_type);
