-- Conta Azul integration tables and Hub OS external references
create extension if not exists pgcrypto;

alter table public.os_orders
  add column if not exists external_source text,
  add column if not exists external_id text;

create index if not exists os_orders_external_idx on public.os_orders (external_source, external_id);

create table if not exists public.conta_azul_tokens (
  id smallint primary key default 1,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz default now()
);

create table if not exists public.conta_azul_sync_state (
  id smallint primary key default 1,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz default now()
);

create table if not exists public.conta_azul_sales_imports (
  id uuid primary key default gen_random_uuid(),
  venda_id text not null unique,
  venda_numero text,
  cliente_nome text,
  hub_os_card_id uuid,
  imported_at timestamptz default now()
);

create or replace function public.set_updated_at_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists conta_azul_tokens_set_updated_at on public.conta_azul_tokens;
create trigger conta_azul_tokens_set_updated_at
  before update on public.conta_azul_tokens
  for each row execute procedure public.set_updated_at_timestamp();

drop trigger if exists conta_azul_sync_state_set_updated_at on public.conta_azul_sync_state;
create trigger conta_azul_sync_state_set_updated_at
  before update on public.conta_azul_sync_state
  for each row execute procedure public.set_updated_at_timestamp();

alter table public.conta_azul_tokens enable row level security;
alter table public.conta_azul_sync_state enable row level security;
alter table public.conta_azul_sales_imports enable row level security;

-- No policies: access only via service_role (server-side).
