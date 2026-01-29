-- Hub OS dual boards and required fields
alter table public.os
  add column if not exists sale_number text,
  add column if not exists client_name text,
  add column if not exists delivery_date date,
  add column if not exists delivery_type text,
  add column if not exists shipping_carrier text,
  add column if not exists tracking_code text,
  add column if not exists address text,
  add column if not exists notes text,
  add column if not exists installation_date date,
  add column if not exists installation_time_window text,
  add column if not exists on_site_contact text,
  add column if not exists status_arte text,
  add column if not exists status_producao text,
  add column if not exists is_reproducao boolean default false,
  add column if not exists repro_motivo text,
  add column if not exists has_letra_caixa boolean default false;

update public.os
set client_name = customer_name
where client_name is null;

update public.os
set status_arte = 'Caixa de Entrada'
where status_arte is null;
