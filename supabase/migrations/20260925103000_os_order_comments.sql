-- Phase 2: internal comments. Soft deletion preserves traceability.
create table public.os_order_comments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.os_orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) default auth.uid(),
  message text not null check (length(trim(message)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index os_order_comments_order_created_idx on public.os_order_comments(order_id, created_at desc) where deleted_at is null;
create trigger os_order_comments_updated_at before update on public.os_order_comments
for each row execute function public.set_phase2_updated_at();
alter table public.os_order_comments enable row level security;
create policy "os_order_comments_read_hub" on public.os_order_comments for select to authenticated
using (public.has_module_access(auth.uid(), 'hub_os'));
create policy "os_order_comments_insert_hub" on public.os_order_comments for insert to authenticated
with check (public.has_module_access(auth.uid(), 'hub_os') and user_id = auth.uid());
create policy "os_order_comments_update_own_or_manager" on public.os_order_comments for update to authenticated
using (public.has_module_access(auth.uid(), 'hub_os') and (user_id = auth.uid() or public.is_manager(auth.uid())))
with check (public.has_module_access(auth.uid(), 'hub_os') and (user_id = auth.uid() or public.is_manager(auth.uid())));

