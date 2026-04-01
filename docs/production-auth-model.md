# Modelo de autorização em produção

## Fonte de verdade
- Papel do usuário: `public.profiles.role`.
- Módulos: `public.user_module_access`.
- JWT é usado para autenticação; autorização é validada contra `profiles`.

## Regras
- `isAdmin` no frontend deriva de `buildAuthorizationSnapshot(role)`.
- Apenas `gerente` (incluindo legado `admin` normalizado) recebe permissões administrativas.
- Ter módulo ativo **não** promove usuário para gerente.

## Endpoints administrativos
`/api/admin-users` valida:
1. JWT válido.
2. Papel normalizado em `profiles`.
3. Regras de módulos mínimos para gerente.

## Endpoint canônico de otimização
- O fluxo de otimização de instalações em produção é `POST /api/hub-os/optimize-installations` (Vercel Serverless).
- Não existe rota canônica equivalente em Supabase Edge Functions.

## Edge Functions de R2
As funções `r2-presign-upload`, `r2-presign-download` e `r2-delete-objects` validam:
1. Header `Authorization: Bearer <jwt>` obrigatório e válido em `supabase.auth.getUser(token)`.
2. Acesso ao módulo `hub_os` em `user_module_access`.
3. Key de objeto com prefixo permitido (`os_orders/`) e path válido.
4. Bucket exclusivamente por segredo de ambiente (`R2_BUCKET`), sem override por payload.

## Compatibilidade legado
- `admin` é normalizado para `gerente`.
- `consultor` é normalizado para `consultor_vendas`.
