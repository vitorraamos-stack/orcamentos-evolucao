-- Script para corrigir acesso de Admin
-- Rode este script no Editor SQL do Supabase

-- 1. Insere perfis para usuários que já existem na tabela auth.users mas não têm perfil
insert into public.profiles (id, email, role)
select id, email, 'consultor'
from auth.users
where id not in (select id from public.profiles);

-- 2. Define TODOS os usuários atuais como ADMIN (Cuidado: use apenas na configuração inicial)
-- Se quiser definir apenas um específico, descomente a cláusula WHERE e coloque seu email
update public.profiles
set role = 'admin'
-- where email = 'seu@email.com'; -- Substitua pelo seu email se quiser ser específico
;

-- 3. Verifica se funcionou
select * from public.profiles;
