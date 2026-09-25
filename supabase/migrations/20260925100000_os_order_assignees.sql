-- Phase 2: one primary system user per operational scope.
create or replace function public.set_phase2_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create table public.os_order_assignees (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.os_orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  scope text not null check (scope in ('GENERAL','ART','PRODUCTION','FINISHING','INSTALLATION')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (order_id, scope)
);
create index os_order_assignees_user_idx on public.os_order_assignees(user_id);
create trigger os_order_assignees_updated_at before update on public.os_order_assignees
for each row execute function public.set_phase2_updated_at();
alter table public.os_order_assignees enable row level security;
create policy "os_order_assignees_read_hub" on public.os_order_assignees for select to authenticated
using (public.has_module_access(auth.uid(), 'hub_os'));
create policy "os_order_assignees_insert_manager" on public.os_order_assignees for insert to authenticated
with check (public.has_module_access(auth.uid(), 'hub_os') and public.is_manager(auth.uid()));
create policy "os_order_assignees_update_manager" on public.os_order_assignees for update to authenticated
using (public.has_module_access(auth.uid(), 'hub_os') and public.is_manager(auth.uid()))
with check (public.has_module_access(auth.uid(), 'hub_os') and public.is_manager(auth.uid()));
create policy "os_order_assignees_delete_manager" on public.os_order_assignees for delete to authenticated
using (public.has_module_access(auth.uid(), 'hub_os') and public.is_manager(auth.uid()));

-- History must be visible on the operational detail to every Hub OS user.
drop policy if exists "os_orders_event_select_admin" on public.os_orders_event;
create policy "os_orders_event_select_hub" on public.os_orders_event for select to authenticated
using (public.has_module_access(auth.uid(), 'hub_os'));

