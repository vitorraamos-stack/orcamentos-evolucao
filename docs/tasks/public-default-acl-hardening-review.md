# EvoluSystem — Restringir ACL padrão de novas tabelas públicas

**Estado:** PROPOSTA DE REVISÃO — nenhum SQL aplicado no Supabase.

## Objetivo e contexto

Após a desativação de **Automatically expose new tables**, as ACLs
para as tabelas futuras criadas pelo papel `postgres` em `public`
não concedem mais operações CRUD a `anon` e `authenticated`,
mas **ainda concedem `TRUNCATE`, `TRIGGER`, `REFERENCES` e
`MAINTAIN`**. O banco é PostgreSQL 17.6, no qual `MAINTAIN`
é um privilégio próprio.

A operação revisada é:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLES FROM anon, authenticated;
```

Ela afeta somente os **futuros objetos criados por `postgres`
dentro do schema `public`**, e não tabelas existentes.
Mantém as permissões de `service_role`, a gestão atual de
sequências/funções e as demais permissões já atribuídas.

## Evidências somente de leitura, 16/10/2026

- PostgreSQL 17.6; a conexão atual usa `postgres`.
- As 51 tabelas atuais em `public` têm RLS ativada.
- Para `postgres`: `anon` e `authenticated` possuem apenas
  `MAINTAIN`, `REFERENCES`, `TRIGGER`, `TRUNCATE` como
  ACL padrão de tabelas em `public`.
- `service_role` também possui essas quatro permissões,
  que o candidato preserva.
- Não existe default ACL **global** de tabelas criada para `postgres`.
  Isso é importante: privilégios globais não podem ser revogados
  por uma instrução `IN SCHEMA`.
- Para `supabase_admin`, as defaults em `public` ainda concedem
  CRUD e privilégios administrativos a ambos os papéis client-side.
  **`postgres` não é membro de `supabase_admin`.**
- A migration 19V-C1 já está aplicada às três tabelas financeiras
  legadas e não será reexecutada.
- O Data API atualmente tem `public` e `graphql_public` expostos;
  `evolusystem_finance_private` não está exposto e a 19V-C2
  não foi aplicada.

## O que este PR não tenta resolver

- Não modifica **`supabase_admin`**, que é uma role gerenciada
  pelo provedor. Qualquer ajuste às ACLs padrão dessa role exige
  revisão de compatibilidade/autorização própria. Não usar
  `SET ROLE` nem tentar assumir seus privilégios.
- Não altera concessões existentes, funções, sequências,
  políticas RLS, schemas expostos, triggers, dados financeiros,
  eventos ou a migration da 19V-C2.
- Não altera a forma como a Vercel publica o frontend.
- Não substitui a exigência de **GRANT explícito + RLS + policies**
  ao implementar novas tabelas que realmente precisem da Data API.

## Critérios para eventual aplicação

1. Confirmar novamente que a opção de exposição automática está
   desativada e que as ACLs `postgres` coincidem com o baseline.
2. Revisar futuras migrations e dependências que esperem default
   `TRIGGER`, `REFERENCES` ou `MAINTAIN` com conta
   `authenticated` (não apenas o acesso de rotina do aplicativo).
3. Aprovar alteração DDL de produção em uma etapa **separada**.
4. Usar `apply_migration` uma única vez, em transação e com
   verificações pre/post; depois verificar `pg_default_acl`,
   `service_role`, RLS existente e o histórico da migration.
5. Manter `supabase_admin` como revisão independente do
   escopo, evitando falsa alegação de isolamento completo.

## Reversão (plano de contingência; não é SQL executável)

Como a mudança afeta apenas defaults de objetos futuros, tabelas
já criadas durante o período de vigência não mudam ao reverter.
Um problema funcional deverá ser corrigido preferencialmente com
`GRANT` explícito, mínimo e auditado na tabela afetada.
Reintroduzir genericamente as quatro permissões elevadas seria
uma redução de segurança, só possível com autorização específica.

**Não mover este candidato para `supabase/migrations` ou
executá-lo em produção sem nova aprovação e testes.**

Fontes oficiais:
- https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html
- https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
- https://supabase.com/docs/guides/api/securing-your-api
