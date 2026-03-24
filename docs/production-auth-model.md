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

## Compatibilidade legado
- `admin` é normalizado para `gerente`.
- `consultor` é normalizado para `consultor_vendas`.
