-- Hub OS archiving and audit events for os_orders
alter table public.os_orders
  add column if not exists archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id);

create table if not exists public.os_orders_event (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id),
  created_at timestamptz default now()
);

create index if not exists os_orders_event_created_at_idx on public.os_orders_event (created_at desc);

alter table public.os_orders enable row level security;
alter table public.os_orders_event enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'os_orders'
      and cmd = 'DELETE'
  loop
    execute format('drop policy if exists %I on public.os_orders', policy_record.policyname);
  end loop;
end $$;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'os_orders'
      and cmd = 'UPDATE'
  loop
    execute format('drop policy if exists %I on public.os_orders', policy_record.policyname);
  end loop;
end $$;

create policy "os_orders_delete_admin"
  on public.os_orders
  for delete
  to authenticated
  using (public.is_admin(auth.uid()));

create policy "os_orders_update_consultor_admin"
  on public.os_orders
  for update
  to authenticated
  using (
    public.is_admin(auth.uid())
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'consultor'
    )
  )
  with check (
    public.is_admin(auth.uid())
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'consultor'
    )
  );

drop policy if exists "os_orders_event_select_admin" on public.os_orders_event;
create policy "os_orders_event_select_admin"
  on public.os_orders_event
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "os_orders_event_insert_authenticated" on public.os_orders_event;
create policy "os_orders_event_insert_authenticated"
  on public.os_orders_event
  for insert
  to authenticated
  with check (auth.uid() is not null);
