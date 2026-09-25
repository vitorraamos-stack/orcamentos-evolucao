-- Phase 2: stage deadlines; os_orders.delivery_date remains the final deadline.
create table public.os_order_deadlines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.os_orders(id) on delete cascade,
  scope text not null check (scope in ('ART','APPROVAL','PRODUCTION','FINISHING','INSTALLATION')),
  due_date date not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, scope)
);
create index os_order_deadlines_due_idx on public.os_order_deadlines(due_date);
create trigger os_order_deadlines_updated_at before update on public.os_order_deadlines
for each row execute function public.set_phase2_updated_at();
alter table public.os_order_deadlines enable row level security;
create policy "os_order_deadlines_read_hub" on public.os_order_deadlines for select to authenticated
using (public.has_module_access(auth.uid(), 'hub_os'));
create policy "os_order_deadlines_insert_manager" on public.os_order_deadlines for insert to authenticated
with check (public.has_module_access(auth.uid(), 'hub_os') and public.is_manager(auth.uid()));
create policy "os_order_deadlines_update_manager" on public.os_order_deadlines for update to authenticated
using (public.has_module_access(auth.uid(), 'hub_os') and public.is_manager(auth.uid()))
with check (public.has_module_access(auth.uid(), 'hub_os') and public.is_manager(auth.uid()));
create policy "os_order_deadlines_delete_manager" on public.os_order_deadlines for delete to authenticated
using (public.has_module_access(auth.uid(), 'hub_os') and public.is_manager(auth.uid()));

