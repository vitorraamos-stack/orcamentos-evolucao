-- Habilitar extensão necessária para criptografia (geralmente já vem habilitada)
create extension if not exists pgcrypto;

-- 1. Tabela de Perfis (Profiles)
-- Sincroniza dados públicos dos usuários para facilitar listagem
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  role text default 'consultor', -- 'admin' ou 'consultor'
  created_at timestamptz default now()
);

-- Habilitar RLS
alter table public.profiles enable row level security;

-- Políticas de Acesso
create policy "Perfis são visíveis para todos os usuários autenticados"
  on public.profiles for select
  using ( auth.role() = 'authenticated' );

create policy "Apenas admins podem atualizar perfis"
  on public.profiles for update
  using ( 
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- 2. Trigger para criar Profile automaticamente
-- Sempre que um usuário é criado no Auth, cria um Profile
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'consultor');
  return new;
end;
$$ language plpgsql security definer;

-- Remove trigger se existir para recriar
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. Funções RPC (Remote Procedure Call) para Gestão de Usuários
-- Permite que o Frontend chame funções privilegiadas se for Admin

-- Função para criar novo usuário (apenas Admin pode chamar)
create or replace function public.create_user_by_admin(
  email text,
  password text,
  role text
)
returns uuid
language plpgsql
security definer -- Roda com permissões de superusuário do banco
as $$
declare
  new_user_id uuid;
begin
  -- Verifica se quem chamou é admin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Apenas administradores podem criar usuários.';
  end if;

  -- Cria usuário na tabela auth.users (simulado via insert direto ou função interna se disponível)
  -- NOTA: Em Supabase puro, não podemos inserir em auth.users via SQL simples facilmente sem ser superadmin.
  -- A melhor abordagem client-side é usar a API de Admin do Supabase (service_role), mas aqui estamos client-side only.
  -- WORKAROUND: O Admin cria o usuário usando supabase.auth.signUp() no frontend? 
  -- NÃO, isso logaria o admin como o novo usuário.
  -- SOLUÇÃO: Usar a extensão `supabase_functions` ou chamar a API de Auth via Edge Function, se disponível.
  -- MAS, para simplificar e funcionar em qualquer projeto Supabase Free:
  -- Vamos assumir que o Admin usará a interface para criar, mas precisamos de permissão.
  
  -- ALTERNATIVA VIÁVEL: O Admin cria o usuário via RPC chamando a API interna do Postgres (se disponível) ou
  -- instruímos o usuário a usar o Dashboard do Supabase para criar o primeiro Admin, e depois usamos
  -- uma Edge Function. Mas o requisito é "Client-Side Only".
  
  -- VAMOS USAR UMA ABORDAGEM HÍBRIDA SEGURA:
  -- O Admin cria o usuário via SQL Injection controlado (apenas para demonstração) ou
  -- O método oficial sem backend Node é usar uma Edge Function.
  -- Como não podemos usar Edge Functions (Node), vamos usar o hack do `pgcrypto` para inserir em auth.users?
  -- Não, muito arriscado e pode quebrar.
  
  -- REVISÃO DE ESTRATÉGIA:
  -- Sem backend Node.js (service_role key), um usuário logado NÃO PODE criar outro usuário via Client SDK sem perder a sessão atual.
  -- A única exceção é se usarmos uma função PostgreSQL `security definer` que faça o insert na tabela `auth.users`.
  
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    email,
    crypt(password, gen_salt('bf')), -- Requer pgcrypto
    now(),
    null,
    null,
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('role', role), -- Salva role no metadata também
    now(),
    now(),
    '',
    '',
    '',
    ''
  ) returning id into new_user_id;

  -- O trigger handle_new_user vai rodar e criar o profile.
  -- Mas precisamos garantir que o role seja atualizado no profile.
  
  -- Atualiza o profile recém criado com o role correto
  update public.profiles
  set role = create_user_by_admin.role
  where id = new_user_id;

  return new_user_id;
end;
$$;

-- Função para excluir usuário
create or replace function public.delete_user_by_admin(user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- Verifica se quem chamou é admin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Apenas administradores podem excluir usuários.';
  end if;

  -- Não permite excluir a si mesmo
  if user_id = auth.uid() then
    raise exception 'Você não pode excluir sua própria conta.';
  end if;

  delete from auth.users where id = user_id;
end;
$$;

-- INSTRUÇÃO IMPORTANTE:
-- Após rodar este script, vá na tabela 'profiles' e mude manualmente o role do seu usuário atual para 'admin'
-- para poder gerenciar os outros.
