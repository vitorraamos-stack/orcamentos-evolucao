-- Add title column to Hub OS orders
alter table public.os_orders
  add column if not exists title text;

update public.os_orders
set title = concat(sale_number, ' - ', client_name)
where title is null;
