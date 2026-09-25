-- Phase 2: operational services/material dimensions, deliberately without commercial values.
create table public.os_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.os_orders(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  description text,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  width_cm numeric(12,2) check (width_cm > 0),
  height_cm numeric(12,2) check (height_cm > 0),
  unit text not null default 'un' check (length(trim(unit)) between 1 and 30),
  notes text,
  status text not null default 'PENDING' check (status in ('PENDING','IN_PROGRESS','READY','CANCELLED')),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  deleted_at timestamptz
);
create index os_order_items_order_sort_idx on public.os_order_items(order_id, sort_order) where deleted_at is null;
create trigger os_order_items_updated_at before update on public.os_order_items
for each row execute function public.set_phase2_updated_at();
alter table public.os_order_items enable row level security;
create policy "os_order_items_read_hub" on public.os_order_items for select to authenticated
using (public.has_module_access(auth.uid(), 'hub_os'));
create policy "os_order_items_insert_manager" on public.os_order_items for insert to authenticated
with check (public.has_module_access(auth.uid(), 'hub_os') and public.is_manager(auth.uid()));
create policy "os_order_items_update_manager" on public.os_order_items for update to authenticated
using (public.has_module_access(auth.uid(), 'hub_os') and public.is_manager(auth.uid()))
with check (public.has_module_access(auth.uid(), 'hub_os') and public.is_manager(auth.uid()));

