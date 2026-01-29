-- Hub OS - tabelas e policies
create extension if not exists pgcrypto;

create table if not exists public.os_status (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null,
  is_terminal boolean default false,
  created_at timestamptz default now()
);

create unique index if not exists os_status_name_unique on public.os_status (name);

create sequence if not exists public.os_number_seq;

create table if not exists public.os (
  id uuid primary key default gen_random_uuid(),
  os_number bigint not null default nextval('public.os_number_seq'),
  quote_id uuid null,
  quote_total numeric(12,2) null,
  customer_name text not null,
  customer_phone text null,
  title text not null,
  description text null,
  folder_path text null,
  status_id uuid not null references public.os_status(id),
  payment_status text not null default 'PENDING',
  created_by uuid null references auth.users(id),
  assigned_to uuid null references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists os_os_number_unique on public.os (os_number);

create table if not exists public.os_payment_proof (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.os(id) on delete cascade,
  method text not null,
  amount numeric(12,2) not null,
  received_date date not null,
  installments text null,
  cadastro_completo boolean not null default false,
  attachment_path text null,
  attachment_url text null,
  status text not null default 'PENDING',
  created_by uuid null references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists public.os_event (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.os(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id),
  created_at timestamptz default now()
);

alter table public.os_status enable row level security;
alter table public.os enable row level security;
alter table public.os_payment_proof enable row level security;
alter table public.os_event enable row level security;

-- Policies (MVP: liberar para autenticados)
create policy "os_status_read"
  on public.os_status for select
  to authenticated
  using (true);

create policy "os_status_write"
  on public.os_status for insert
  to authenticated
  with check (true);

create policy "os_status_update"
  on public.os_status for update
  to authenticated
  using (true)
  with check (true);

create policy "os_status_delete"
  on public.os_status for delete
  to authenticated
  using (true);

create policy "os_read"
  on public.os for select
  to authenticated
  using (true);

create policy "os_insert"
  on public.os for insert
  to authenticated
  with check (true);

create policy "os_update"
  on public.os for update
  to authenticated
  using (true)
  with check (true);

create policy "os_delete"
  on public.os for delete
  to authenticated
  using (true);

create policy "os_payment_read"
  on public.os_payment_proof for select
  to authenticated
  using (true);

create policy "os_payment_insert"
  on public.os_payment_proof for insert
  to authenticated
  with check (true);

create policy "os_payment_update"
  on public.os_payment_proof for update
  to authenticated
  using (true)
  with check (true);

create policy "os_payment_delete"
  on public.os_payment_proof for delete
  to authenticated
  using (true);

create policy "os_event_read"
  on public.os_event for select
  to authenticated
  using (true);

create policy "os_event_insert"
  on public.os_event for insert
  to authenticated
  with check (true);

create policy "os_event_delete"
  on public.os_event for delete
  to authenticated
  using (true);

-- Seed inicial
insert into public.os_status (name, position, is_terminal)
values
  ('Caixa de Entrada', 1, false),
  ('Conferência Comercial', 2, false),
  ('Aguardando Arte', 3, false),
  ('Em Arte', 4, false),
  ('Aguardando Aprovação do Cliente', 5, false),
  ('Produção', 6, false),
  ('Finalizado', 7, true)
on conflict (name) do nothing;
