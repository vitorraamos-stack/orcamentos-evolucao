-- Migração recomendada (idempotente) para alinhar o banco com o Front.
-- Rode no SQL Editor do Supabase.

-- Extensão para UUID
create extension if not exists pgcrypto;

-- 1) Profiles + trigger
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  role text default 'consultor',
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='Perfis são visíveis para usuários autenticados'
  ) then
    create policy "Perfis são visíveis para usuários autenticados"
      on public.profiles for select
      to authenticated
      using (true);
  end if;
end $$;

-- Apenas admin pode atualizar (permite trocar role via UI de Configurações)
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- policies para update (se já existir, recria)
drop policy if exists "Apenas admins podem atualizar perfis" on public.profiles;
create policy "Apenas admins podem atualizar perfis"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'consultor')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Recria trigger
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    DROP TRIGGER on_auth_user_created ON auth.users;
  END IF;
END $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2) Materiais e faixas
create table if not exists public.materials (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  description text,
  equivalence_message text,
  tipo_calculo text not null default 'm2' check (tipo_calculo in ('m2','linear')),
  min_price numeric not null default 0,
  image_url text
);

-- Se a tabela já existia, garante colunas novas
alter table public.materials add column if not exists description text;
alter table public.materials add column if not exists equivalence_message text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='materials' AND column_name='tipo_calculo'
  ) THEN
    ALTER TABLE public.materials ADD COLUMN tipo_calculo text not null default 'm2';
    ALTER TABLE public.materials ADD CONSTRAINT materials_tipo_calculo_check CHECK (tipo_calculo in ('m2','linear'));
  END IF;
END $$;

create table if not exists public.price_tiers (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  material_id uuid references public.materials(id) on delete cascade not null,
  min_area numeric not null default 0,
  max_area numeric,
  price_per_m2 numeric not null default 0
);

alter table public.materials enable row level security;
alter table public.price_tiers enable row level security;

-- 3) RLS: leitura para autenticados
DO $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='materials' and policyname='Materiais visíveis para usuários autenticados'
  ) then
    create policy "Materiais visíveis para usuários autenticados"
      on public.materials for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='price_tiers' and policyname='Faixas de preço visíveis para usuários autenticados'
  ) then
    create policy "Faixas de preço visíveis para usuários autenticados"
      on public.price_tiers for select
      to authenticated
      using (true);
  end if;
end $$;

-- 4) RLS: escrita só para admin
-- Remove políticas MVP antigas, se existirem
DROP POLICY IF EXISTS "Permitir edição total para autenticados (MVP)" ON public.materials;
DROP POLICY IF EXISTS "Permitir edição total para autenticados (MVP)" ON public.price_tiers;

DROP POLICY IF EXISTS "Admins podem editar materiais" ON public.materials;
CREATE POLICY "Admins podem editar materiais"
  ON public.materials
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins podem editar faixas" ON public.price_tiers;
CREATE POLICY "Admins podem editar faixas"
  ON public.price_tiers
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5) Storage bucket (opcional)
insert into storage.buckets (id, name, public)
values ('materials', 'materials', true)
on conflict (id) do nothing;

-- Políticas básicas de storage
DROP POLICY IF EXISTS "Imagens públicas" ON storage.objects;
CREATE POLICY "Imagens públicas"
  ON storage.objects FOR select
  USING (bucket_id = 'materials');

DROP POLICY IF EXISTS "Upload para autenticados" ON storage.objects;
CREATE POLICY "Upload para autenticados"
  ON storage.objects FOR insert
  TO authenticated
  WITH CHECK (bucket_id = 'materials');
