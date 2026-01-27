-- Execute este script no SQL Editor do seu projeto Supabase

-- 1. Tabela de Materiais
create table public.materials (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  min_price numeric not null default 0,
  image_url text
);

-- 2. Tabela de Faixas de Preço
create table public.price_tiers (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  material_id uuid references public.materials(id) on delete cascade not null,
  min_area numeric not null default 0,
  max_area numeric, -- null significa "infinito" (acima de X)
  price_per_m2 numeric not null default 0
);

-- 3. Políticas de Segurança (RLS)
alter table public.materials enable row level security;
alter table public.price_tiers enable row level security;

-- Permitir leitura para todos (autenticados ou anonimos, dependendo da necessidade)
-- Aqui vamos permitir leitura apenas para autenticados para segurança
create policy "Materiais visíveis para usuários autenticados"
  on public.materials for select
  to authenticated
  using (true);

create policy "Faixas de preço visíveis para usuários autenticados"
  on public.price_tiers for select
  to authenticated
  using (true);

-- Permitir escrita apenas para admins (simplificado: qualquer autenticado pode editar neste MVP, 
-- mas idealmente você usaria uma tabela de perfis ou claims customizadas)
-- ATENÇÃO: Para produção, restrinja isso!
create policy "Permitir edição total para autenticados (MVP)"
  on public.materials for all
  to authenticated
  using (true)
  with check (true);

create policy "Permitir edição total para autenticados (MVP)"
  on public.price_tiers for all
  to authenticated
  using (true)
  with check (true);

-- 4. Storage (Opcional, se for usar upload de imagens)
insert into storage.buckets (id, name, public) values ('materials', 'materials', true);

create policy "Imagens públicas"
  on storage.objects for select
  using ( bucket_id = 'materials' );

create policy "Upload para autenticados"
  on storage.objects for insert
  to authenticated
  with check ( bucket_id = 'materials' );
