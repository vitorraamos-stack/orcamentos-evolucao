alter table if exists public.os
  add column if not exists os_number bigint;

alter table if exists public.os_orders
  add column if not exists os_number bigint;
