# PR 31B — leitura integrada e exclusivamente publicada

Esta entrega adiciona **somente** uma API de leitura, sem alteração nas telas,
no Orçamentista existente, nos preços ou nas regras de aprovação.

- GET /api/product-commercial-adapter?productId=<UUID>
- Requer token válido, perfil gestor (gerente/admin) ou consultor_vendas e
  acesso ao módulo biblioteca_produtos, verificados no servidor.
- Parte sempre do vínculo canônico 31A. Não vincula por nome.
- Exige produto técnico ativo, ficha comercial published e publicação em
  library_publications. Não lê draft nem library_product_history.
- A engenharia é representada apenas pelo identificador e número da
  última versão PUBLISHED; nenhuma fórmula, recurso ou custo é retornado.
- Campos e complementos são projetados por allowlist. Qualquer propriedade
  adicional fora do contrato é descartada antes de responder ao navegador.
- mappingStatus=NOT_ASSESSED e pricingStatus=NOT_CHECKED: esta fase não
  confirma elegibilidade para preço, nem gera orçamento ou retificação.
- Falhas de leitura retornam erros genéricos; nenhuma resposta parcial
  com supostos preços ou dados privados.

## Banco

A migration 20261020115833_product_commercial_adapter_31b.sql concede ao
service_role apenas leitura de product_id, version, content e published_at da
tabela library_publications. Não concede leitura ao público e não modifica
publicações atuais. **Aplicada em produção em 20/10/2026, versão 20261020115833; não reaplicar.**

## Rollout

Esta API ficará inativa para o usuário final até integração explícita da etapa
31C/31F. Não fazer merge nem deploy automaticamente.
O fluxo legado /orcamentista e a Biblioteca Comercial continuam intactos.

## Validação da migration em produção
Aplicada com autorização explícita do gestor em 20/10/2026. Conferidos SELECT de 
`product_id`, `version`, `content`, `published_at` para `service_role`; sem INSERT,
UPDATE ou DELETE na tabela de publicações; sem acesso de `service_role` ao draft.
O vínculo do PVC, a publicação comercial V2 e a engenharia V3 permaneceram intactos.
A política de SELECT pré-existente para `authenticated` não foi modificada por esta migration.
O merge e a publicação da API continuam pendentes de autorização separada.
