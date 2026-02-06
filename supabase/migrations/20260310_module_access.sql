-- Module access control and user-module mapping

-- Normalize legacy roles
update public.profiles set role = 'gerente' where role = 'admin';
update public.profiles set role = 'consultor_vendas' where role = 'consultor';

create table if not exists public.app_modules (
  module_key text primary key,
  label text not null,
  route_prefixes jsonb not null default '[]'::jsonb
);

insert into public.app_modules (module_key, label, route_prefixes)
values
  ('hub_os', 'Hub OS', '["/hub-os", "/os"]'),
  ('galeria', 'Galeria', '["/galeria"]'),
  ('calculadora', 'Calculadora', '["/"]'),
  ('materiais', 'Materiais', '["/materiais"]'),
  ('configuracoes', 'Configurações', '["/configuracoes"]')
on conflict (module_key) do update
  set label = excluded.label,
      route_prefixes = excluded.route_prefixes;

create table if not exists public.user_module_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null references public.app_modules(module_key),
  created_at timestamptz not null default now(),
  primary key (user_id, module_key)
);

alter table public.app_modules enable row level security;
alter table public.user_module_access enable row level security;

create or replace function public.is_manager(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role in ('admin', 'gerente')
  );
$$;

create or replace function public.has_module_access(uid uuid, module_key text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_module_access uma
    where uma.user_id = uid
      and uma.module_key = has_module_access.module_key
  );
$$;

create or replace function public.set_user_modules(target_user_id uuid, module_keys text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.user_module_access where user_id = target_user_id;
  if module_keys is not null then
    insert into public.user_module_access (user_id, module_key)
    select target_user_id, unnest(module_keys);
  end if;
end;
$$;

grant execute on function public.is_manager(uuid) to authenticated;
grant execute on function public.has_module_access(uuid, text) to authenticated;

drop policy if exists "app_modules_select_authenticated" on public.app_modules;
create policy "app_modules_select_authenticated"
  on public.app_modules
  for select
  to authenticated
  using (true);

drop policy if exists "user_module_access_select_own" on public.user_module_access;
create policy "user_module_access_select_own"
  on public.user_module_access
  for select
  to authenticated
  using (auth.uid() = user_id or public.is_manager(auth.uid()));

drop policy if exists "user_module_access_insert_manager" on public.user_module_access;
create policy "user_module_access_insert_manager"
  on public.user_module_access
  for insert
  to authenticated
  with check (public.is_manager(auth.uid()));

drop policy if exists "user_module_access_update_manager" on public.user_module_access;
create policy "user_module_access_update_manager"
  on public.user_module_access
  for update
  to authenticated
  using (public.is_manager(auth.uid()))
  with check (public.is_manager(auth.uid()));

drop policy if exists "user_module_access_delete_manager" on public.user_module_access;
create policy "user_module_access_delete_manager"
  on public.user_module_access
  for delete
  to authenticated
  using (public.is_manager(auth.uid()));

insert into public.user_module_access (user_id, module_key)
select p.id, m.module_key
from public.profiles p
join public.app_modules m on true
where p.role in ('admin', 'gerente')
on conflict do nothing;

insert into public.user_module_access (user_id, module_key)
select p.id, m.module_key
from public.profiles p
join public.app_modules m on m.module_key in ('hub_os', 'galeria', 'calculadora')
where p.role not in ('admin', 'gerente')
on conflict do nothing;

-- Hub OS module enforcement
drop policy if exists "os_status_read" on public.os_status;
drop policy if exists "os_status_write" on public.os_status;
drop policy if exists "os_status_update" on public.os_status;
drop policy if exists "os_status_delete" on public.os_status;

create policy "os_status_read"
  on public.os_status for select
  to authenticated
  using (public.has_module_access(auth.uid(), 'hub_os'));

create policy "os_status_write"
  on public.os_status for insert
  to authenticated
  with check (public.has_module_access(auth.uid(), 'hub_os'));

create policy "os_status_update"
  on public.os_status for update
  to authenticated
  using (public.has_module_access(auth.uid(), 'hub_os'))
  with check (public.has_module_access(auth.uid(), 'hub_os'));

create policy "os_status_delete"
  on public.os_status for delete
  to authenticated
  using (public.has_module_access(auth.uid(), 'hub_os'));

drop policy if exists "os_read" on public.os;
drop policy if exists "os_insert" on public.os;
drop policy if exists "os_update" on public.os;
drop policy if exists "os_delete" on public.os;

create policy "os_read"
  on public.os for select
  to authenticated
  using (public.has_module_access(auth.uid(), 'hub_os'));

create policy "os_insert"
  on public.os for insert
  to authenticated
  with check (public.has_module_access(auth.uid(), 'hub_os'));

create policy "os_update"
  on public.os for update
  to authenticated
  using (public.has_module_access(auth.uid(), 'hub_os'))
  with check (public.has_module_access(auth.uid(), 'hub_os'));

create policy "os_delete"
  on public.os for delete
  to authenticated
  using (public.has_module_access(auth.uid(), 'hub_os'));

drop policy if exists "os_payment_read" on public.os_payment_proof;
drop policy if exists "os_payment_insert" on public.os_payment_proof;
drop policy if exists "os_payment_update" on public.os_payment_proof;
drop policy if exists "os_payment_delete" on public.os_payment_proof;

create policy "os_payment_read"
  on public.os_payment_proof for select
  to authenticated
  using (public.has_module_access(auth.uid(), 'hub_os'));

create policy "os_payment_insert"
  on public.os_payment_proof for insert
  to authenticated
  with check (public.has_module_access(auth.uid(), 'hub_os'));

create policy "os_payment_update"
  on public.os_payment_proof for update
  to authenticated
  using (public.has_module_access(auth.uid(), 'hub_os'))
  with check (public.has_module_access(auth.uid(), 'hub_os'));

create policy "os_payment_delete"
  on public.os_payment_proof for delete
  to authenticated
  using (public.has_module_access(auth.uid(), 'hub_os'));

drop policy if exists "os_event_read" on public.os_event;
drop policy if exists "os_event_insert" on public.os_event;
drop policy if exists "os_event_delete" on public.os_event;

create policy "os_event_read"
  on public.os_event for select
  to authenticated
  using (public.has_module_access(auth.uid(), 'hub_os'));

create policy "os_event_insert"
  on public.os_event for insert
  to authenticated
  with check (public.has_module_access(auth.uid(), 'hub_os'));

create policy "os_event_delete"
  on public.os_event for delete
  to authenticated
  using (public.has_module_access(auth.uid(), 'hub_os'));

drop policy if exists "os_orders_delete_admin" on public.os_orders;
drop policy if exists "os_orders_update_consultor_admin" on public.os_orders;

create policy "os_orders_delete_admin"
  on public.os_orders
  for delete
  to authenticated
  using (public.has_module_access(auth.uid(), 'hub_os') and public.is_admin(auth.uid()));

create policy "os_orders_update_consultor_admin"
  on public.os_orders
  for update
  to authenticated
  using (
    public.has_module_access(auth.uid(), 'hub_os')
    and (
      public.is_admin(auth.uid())
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'consultor_vendas'
      )
    )
  )
  with check (
    public.has_module_access(auth.uid(), 'hub_os')
    and (
      public.is_admin(auth.uid())
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'consultor_vendas'
      )
    )
  );

drop policy if exists "os_orders_event_select_admin" on public.os_orders_event;
drop policy if exists "os_orders_event_insert_authenticated" on public.os_orders_event;

create policy "os_orders_event_select_admin"
  on public.os_orders_event
  for select
  to authenticated
  using (public.has_module_access(auth.uid(), 'hub_os') and public.is_admin(auth.uid()));

create policy "os_orders_event_insert_authenticated"
  on public.os_orders_event
  for insert
  to authenticated
  with check (public.has_module_access(auth.uid(), 'hub_os') and auth.uid() is not null);

drop policy if exists "os_order_asset_jobs_select_authenticated" on public.os_order_asset_jobs;
drop policy if exists "os_order_asset_jobs_insert_authenticated" on public.os_order_asset_jobs;
drop policy if exists "os_order_asset_jobs_update_authenticated" on public.os_order_asset_jobs;
drop policy if exists "os_order_asset_jobs_delete_admin" on public.os_order_asset_jobs;

create policy "os_order_asset_jobs_select_authenticated"
  on public.os_order_asset_jobs
  for select
  to authenticated
  using (public.has_module_access(auth.uid(), 'hub_os'));

create policy "os_order_asset_jobs_insert_authenticated"
  on public.os_order_asset_jobs
  for insert
  to authenticated
  with check (public.has_module_access(auth.uid(), 'hub_os'));

create policy "os_order_asset_jobs_update_authenticated"
  on public.os_order_asset_jobs
  for update
  to authenticated
  using (public.has_module_access(auth.uid(), 'hub_os'))
  with check (public.has_module_access(auth.uid(), 'hub_os'));

create policy "os_order_asset_jobs_delete_admin"
  on public.os_order_asset_jobs
  for delete
  to authenticated
  using (public.has_module_access(auth.uid(), 'hub_os') and public.is_admin(auth.uid()));

drop policy if exists "os_order_assets_select_authenticated" on public.os_order_assets;
drop policy if exists "os_order_assets_insert_authenticated" on public.os_order_assets;
drop policy if exists "os_order_assets_update_authenticated" on public.os_order_assets;
drop policy if exists "os_order_assets_delete_admin" on public.os_order_assets;

create policy "os_order_assets_select_authenticated"
  on public.os_order_assets
  for select
  to authenticated
  using (public.has_module_access(auth.uid(), 'hub_os'));

create policy "os_order_assets_insert_authenticated"
  on public.os_order_assets
  for insert
  to authenticated
  with check (public.has_module_access(auth.uid(), 'hub_os'));

create policy "os_order_assets_update_authenticated"
  on public.os_order_assets
  for update
  to authenticated
  using (public.has_module_access(auth.uid(), 'hub_os'))
  with check (public.has_module_access(auth.uid(), 'hub_os'));

create policy "os_order_assets_delete_admin"
  on public.os_order_assets
  for delete
  to authenticated
  using (public.has_module_access(auth.uid(), 'hub_os') and public.is_admin(auth.uid()));
