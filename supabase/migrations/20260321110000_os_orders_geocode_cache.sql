alter table if exists public.os_orders
  add column if not exists address_lat double precision,
  add column if not exists address_lng double precision,
  add column if not exists address_geocoded_at timestamptz,
  add column if not exists address_geocode_provider text;

create index if not exists os_orders_delivery_logistic_idx
  on public.os_orders (delivery_date, logistic_type);

create index if not exists os_orders_address_coordinates_idx
  on public.os_orders (address_lat, address_lng);
