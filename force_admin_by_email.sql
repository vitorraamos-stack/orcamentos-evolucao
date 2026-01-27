-- Script para FORÇAR Admin por Email
-- Substitua 'SEU_EMAIL_AQUI' pelo seu email real antes de rodar

DO $$
DECLARE
  target_email text := 'SEU_EMAIL_AQUI'; -- <--- COLOQUE SEU EMAIL AQUI
  target_user_id uuid;
BEGIN
  -- 1. Busca o ID do usuário pelo email
  select id into target_user_id from auth.users where email = target_email;

  IF target_user_id IS NULL THEN
    RAISE NOTICE 'Usuário com email % não encontrado!', target_email;
  ELSE
    -- 2. Garante que existe perfil
    insert into public.profiles (id, email, role)
    values (target_user_id, target_email, 'admin')
    on conflict (id) do update
    set role = 'admin'; -- 3. Força update para admin se já existir
    
    RAISE NOTICE 'Usuário % (ID: %) agora é ADMIN.', target_email, target_user_id;
  END IF;
END $$;
