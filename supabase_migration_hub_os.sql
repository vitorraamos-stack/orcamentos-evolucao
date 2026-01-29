-- Hub OS main table for arte/produção
create extension if not exists pgcrypto;

create table if not exists public.os_orders (
  id uuid primary key default gen_random_uuid(),
  sale_number text not null,
  client_name text not null,
  description text,
  delivery_date date,
  logistic_type text not null default 'retirada' check (logistic_type in ('retirada', 'entrega', 'instalacao')),
  address text,
  art_status text not null default 'Caixa de Entrada',
  prod_status text,
  reproducao boolean not null default false,
  letra_caixa boolean not null default false,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists os_orders_art_status_idx on public.os_orders (art_status);
create index if not exists os_orders_prod_status_idx on public.os_orders (prod_status);
create index if not exists os_orders_delivery_date_idx on public.os_orders (delivery_date);
create index if not exists os_orders_created_at_idx on public.os_orders (created_at);

create or replace function public.set_os_orders_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  if auth.uid() is not null then
    new.updated_by = auth.uid();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists os_orders_set_updated_at on public.os_orders;
create trigger os_orders_set_updated_at
  before update on public.os_orders
  for each row execute procedure public.set_os_orders_updated_at();

alter table public.os_orders enable row level security;

create policy "os_orders_select_authenticated"
  on public.os_orders for select
  to authenticated
  using (auth.uid() is not null);

create policy "os_orders_insert_authenticated"
  on public.os_orders for insert
  to authenticated
  with check (auth.uid() is not null);

create policy "os_orders_update_authenticated"
  on public.os_orders for update
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy "os_orders_delete_admin"
  on public.os_orders for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
