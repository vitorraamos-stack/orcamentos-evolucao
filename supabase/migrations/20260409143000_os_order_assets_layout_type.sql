alter table public.os_order_assets
  drop constraint if exists os_order_assets_asset_type_check;

alter table public.os_order_assets
  add constraint os_order_assets_asset_type_check
  check (asset_type in ('CLIENT_FILE', 'PAYMENT_PROOF', 'PURCHASE_ORDER', 'LAYOUT'));
