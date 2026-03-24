# Bootstrap seguro do primeiro gerente

## Objetivo
Promover **apenas um usuário autenticado** para `gerente` sem fallback por e-mail no frontend.

## Pré-requisitos
- Projeto Supabase com migrations aplicadas.
- Usuário alvo já criado no Supabase Auth.

## Passos (SQL Editor)
1. Identifique o `id` real no `auth.users`.
2. Execute SQL parametrizado com o `id` escolhido:

```sql
insert into public.profiles (id, email, role)
select u.id, u.email, 'gerente'
from auth.users u
where u.id = '<USER_ID>'::uuid
on conflict (id) do update
set role = 'gerente',
    email = excluded.email;
```

3. Garanta acesso aos módulos mínimos de gestão:

```sql
insert into public.user_module_access (user_id, module_key)
values
  ('<USER_ID>'::uuid, 'configuracoes'),
  ('<USER_ID>'::uuid, 'hub_os_kiosk')
on conflict (user_id, module_key) do nothing;
```

4. Valide login no app e acesso à tela `/configuracoes`.

## Observações
- Não use promoção por e-mail/string.
- Não compartilhe `SUPABASE_SERVICE_ROLE_KEY` no frontend.
