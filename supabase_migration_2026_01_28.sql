-- Migração recomendada (idempotente) para alinhar o banco com o front atual

create extension if not exists pgcrypto;

-- 1) Materiais
create table if not exists public.materials (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  name text not null,
  description text,
  equivalence_message text,
  tipo_calculo text not null default 'm2' check (tipo_calculo in ('m2','linear')),
  min_price numeric not null default 0,
  image_url text
);

-- 2) Faixas de preço
create table if not exists public.price_tiers (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  material_id uuid references public.materials(id) on delete cascade not null,
  min_area numeric not null default 0,
  max_area numeric,
  price_per_m2 numeric not null default 0
);

-- 3) Profiles
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  role text default 'consultor',
  created_at timestamptz default now()
);

-- 4) Trigger para criar profile no signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'consultor')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 5) RLS
alter table public.materials enable row level security;
alter table public.price_tiers enable row level security;
alter table public.profiles enable row level security;

-- Select para autenticados
drop policy if exists "Materiais visíveis para usuários autenticados" on public.materials;
create policy "Materiais visíveis para usuários autenticados"
  on public.materials for select
  to authenticated
  using (true);

drop policy if exists "Faixas de preço visíveis para usuários autenticados" on public.price_tiers;
create policy "Faixas de preço visíveis para usuários autenticados"
  on public.price_tiers for select
  to authenticated
  using (true);

-- Profiles visíveis para autenticados
drop policy if exists "Perfis são visíveis para todos os usuários autenticados" on public.profiles;
create policy "Perfis são visíveis para todos os usuários autenticados"
  on public.profiles for select
  to authenticated
  using (true);

-- Escrita somente para admin (materiais/tabelas/preços)
-- OBS: o service_role (usado na API /api/admin-users) ignora RLS, então continua funcionando.

drop policy if exists "Permitir edição total para autenticados (MVP)" on public.materials;
create policy "Admins podem editar materiais"
  on public.materials for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "Permitir edição total para autenticados (MVP)" on public.price_tiers;
create policy "Admins podem editar faixas de preço"
  on public.price_tiers for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Atualização de profiles só para admin
 drop policy if exists "Apenas admins podem atualizar perfis" on public.profiles;
create policy "Apenas admins podem atualizar perfis"
  on public.profiles for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- 6) Storage bucket (opcional)
-- Se já existir, ignore o erro manualmente ou comente esta linha.
insert into storage.buckets (id, name, public)
values ('materials', 'materials', true)
on conflict (id) do nothing;

-- Políticas Storage
-- Select público (ou restrinja para autenticados se preferir)
drop policy if exists "Imagens públicas" on storage.objects;
create policy "Imagens públicas"
  on storage.objects for select
  using ( bucket_id = 'materials' );

-- Upload para admin (recomendado)
drop policy if exists "Upload para autenticados" on storage.objects;
create policy "Upload admin"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'materials'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
