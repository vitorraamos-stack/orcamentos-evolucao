# PR 31A — Associação canônica (fundação)

## Escopo
Adicionar exclusivamente o relacionamento 1:1 entre products (Engenharia) e
library_products (Biblioteca), sem preço, sem migração de conteúdo e sem UI nova.

- Migration aditiva: 20261020111643_product_commercial_links_31a.sql.
- Serviço administrativo: api/product-commercial-links.ts
  - GET /api/product-commercial-links (opcional ?productId=UUID)
  - POST /api/product-commercial-links com ação LINK_PRODUCT, productId e libraryProductId.
- Identidade do responsável é obtida exclusivamente do bearer autenticado.
- Exige perfil gerente/admin e acesso ao módulo biblioteca_produtos.
- Acesso direto pelo cliente (anon/authenticated) à tabela nova é revogado.
- Repetição do mesmo par retorna o vínculo existente. Outro par envolvendo
  um dos registros já vinculados retorna 409 LINK_CONFLICT.
- Sem UPDATE, DELETE, backfill ou associação automática pelo nome.

## Operação controlada
Migration aplicada no Supabase de produção em 20/10/2026 mediante autorização explícita do gestor, registrada sob a versão 20261020111643. NÃO reaplicar.
NÃO criar a associação inicial em produção sem autorização separada.
Após a aprovação da migration, validar RLS/grants e testar em ambiente isolado
antes de autorizar a vinculação do PVC.

IDs verificados em auditoria, para associação futura separada:
- products.id: 87dd356a-1212-487d-b3f3-9c2837a454d4
- library_products.id: b82b8f06-b19a-46ed-ab05-a876f815bde3

## Dependência
O PR 31B deverá consumir esse vínculo, com leitura somente das publicações comerciais.
O PR 31A não altera /orcamentista, Biblioteca, Engenharia, políticas financeiras,
históricos nem a transferência ao Conta Azul.

## Testes
Executar npm run check, npm run test, npm run build:app.
Não foi aplicada migration em produção durante o desenvolvimento desta branch.

## Homologação isolada — pendente de ambiente disponível
Em 20/10/2026 foi verificado: somente a branch Supabase principal está ativa;
o projeto existente "evolusystem-homologacao-19u" encontra-se INATIVO.
Não houve restauração, criação de branch paga ou alteração do banco de produção.

Após disponibilizar um banco isolado com o esquema necessário:
1. Aplicar a migration APENAS nesse ambiente.
2. Executar o SQL de auditoria somente leitura em
   `docs/architecture/pr-31a-readonly-db-verification.sql`, exigindo todos
   os indicadores terminados em `_pass` como `true`.
3. Testar a API com gestor habilitado e verificar acesso negado para consultor
   e usuário anônimo.
4. Testar criação, repetição idempotente, conflito 1:1, concorrência e
   impedimento de exclusão referencial em dados artificiais.
5. Documentar o resultado ANTES de autorizar aplicação no banco real.

## Validação de produção de 20/10/2026
A migration `20261020111643` foi aplicada via Supabase e todas as 17 verificações do roteiro somente leitura passaram. A tabela está vazia, RLS e privilégios foram validados, e a associação do PVC não foi executada. GitHub merge e deploy manual permanecem pendentes de autorização específica.
