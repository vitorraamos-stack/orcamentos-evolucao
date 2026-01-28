-- Execute este script no SQL Editor do seu projeto Supabase
-- Ele é idempotente (pode rodar mais de uma vez).

-- Extensões
create extension if not exists pgcrypto;

-- 1) Materiais
create table if not exists public.materials (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  description text,
  equivalence_message text,
  tipo_calculo text not null default 'm2' check (tipo_calculo in ('m2', 'linear')),
  min_price numeric not null default 0,
  image_url text
);

-- 2) Faixas de Preço (Tiered pricing)
create table if not exists public.price_tiers (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  material_id uuid references public.materials(id) on delete cascade not null,
  min_area numeric not null default 0,
  max_area numeric, -- null significa "infinito" (acima de X)
  price_per_m2 numeric not null default 0
);

-- 3) Perfis (roles)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  role text default 'consultor', -- 'admin' ou 'consultor'
  created_at timestamptz default now()
);

-- 4) Trigger: cria profile ao criar usuário
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'consultor')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================
-- RLS (Row Level Security)
-- =========================================================
alter table public.materials enable row level security;
alter table public.price_tiers enable row level security;
alter table public.profiles enable row level security;

-- Helper (inline): check admin via profiles
-- (Usamos EXISTS direto nas policies)

-- Limpa policies antigas (se existirem)
-- Materiais
drop policy if exists "Materiais visíveis para usuários autenticados" on public.materials;
drop policy if exists "Permitir edição total para autenticados (MVP)" on public.materials;
drop policy if exists "Materiais - leitura" on public.materials;
drop policy if exists "Materiais - admin escreve" on public.materials;
drop policy if exists "Materiais - admin atualiza" on public.materials;
drop policy if exists "Materiais - admin remove" on public.materials;

-- Price tiers
drop policy if exists "Faixas de preço visíveis para usuários autenticados" on public.price_tiers;
drop policy if exists "Permitir edição total para autenticados (MVP)" on public.price_tiers;
drop policy if exists "Faixas - leitura" on public.price_tiers;
drop policy if exists "Faixas - admin escreve" on public.price_tiers;
drop policy if exists "Faixas - admin atualiza" on public.price_tiers;
drop policy if exists "Faixas - admin remove" on public.price_tiers;

-- Profiles
drop policy if exists "Perfis são visíveis para todos os usuários autenticados" on public.profiles;
drop policy if exists "Apenas admins podem atualizar perfis" on public.profiles;
drop policy if exists "Perfis - leitura" on public.profiles;
drop policy if exists "Perfis - admin atualiza" on public.profiles;
drop policy if exists "Perfis - self insert" on public.profiles;

-- Materiais: leitura para autenticados
create policy "Materiais - leitura"
  on public.materials for select
  to authenticated
  using (true);

-- Materiais: escrita só admin
create policy "Materiais - admin escreve"
  on public.materials for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Materiais - admin atualiza"
  on public.materials for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Materiais - admin remove"
  on public.materials for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Faixas: leitura para autenticados
create policy "Faixas - leitura"
  on public.price_tiers for select
  to authenticated
  using (true);

-- Faixas: escrita só admin
create policy "Faixas - admin escreve"
  on public.price_tiers for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Faixas - admin atualiza"
  on public.price_tiers for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Faixas - admin remove"
  on public.price_tiers for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Profiles: leitura para autenticados
create policy "Perfis - leitura"
  on public.profiles for select
  to authenticated
  using (true);

-- Profiles: permite que o próprio usuário tenha/ajuste seu e-mail (opcional)
create policy "Perfis - self insert"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

-- Profiles: atualização só admin
create policy "Perfis - admin atualiza"
  on public.profiles for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- =========================================================
-- Storage (opcional)
-- =========================================================
insert into storage.buckets (id, name, public)
values ('materials', 'materials', true)
on conflict (id) do nothing;

-- Policies de Storage
-- Leitura pública das imagens (se quiser restringir, troque para to authenticated)
drop policy if exists "Imagens públicas" on storage.objects;
create policy "Imagens públicas"
  on storage.objects for select
  using ( bucket_id = 'materials' );

-- Upload: admin
drop policy if exists "Upload para autenticados" on storage.objects;
create policy "Upload para admin"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'materials'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
