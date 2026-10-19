# PR 31A — Associação canônica (fundação)

## Escopo
Adicionar exclusivamente o relacionamento 1:1 entre products (Engenharia) e
library_products (Biblioteca), sem preço, sem migração de conteúdo e sem UI nova.

- Migration aditiva: 20261019192945_product_commercial_links_31a.sql.
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
NÃO aplicar a migration nem criar a associação inicial em produção sem autorização.
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
