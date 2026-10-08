# 18G — Negociação gerencial de Quote

Status: **domínio e desenho de persistência prontos para implementação controlada**.

Esta etapa fecha a regra comercial que permaneceu explicitamente adiada desde 16C:
- consultor não altera o preço calculado;
- gerente pode ajustar o valor final de um Quote;
- venda abaixo do mínimo exige override explícito e justificativa;
- negociação nunca sobrescreve o resultado técnico de Costing/Pricing;
- Quote emitido continua sendo snapshot imutável.

## 1. Regra de autoridade

O browser nunca informa:
- custo;
- markup;
- preço mínimo;
- taxa financeira;
- preço oficial anterior;
- piso comercial calculado.

O servidor recalcula o Quote oficial e deriva o piso protegido.

Somente `gerente` pode usar `MANAGER_FINAL_PRICE`.
`consultor_vendas` permanece sempre em `OFFICIAL`.

Toda alteração manual exige:
- valor final com duas casas decimais;
- justificativa textual;
- auditoria do ator.

Se o valor ficar abaixo do piso protegido, também exige:
- `allowBelowMinimum = true`;
- autorização gerencial já validada no servidor.

## 2. Piso protegido

O mínimo persistido pertence ao produto, mas o Quote pode conter instalação, munck e condição financeira.

Por isso o piso protegido do Quote é derivado server-side com a mesma composição comercial do Quote oficial:

1. preço mínimo do produto;
2. instalação contratada;
3. munck contratado;
4. taxa financeira da condição de pagamento;
5. arredondamento comercial `BRL_2DP_HALF_UP_V1`.

Assim, um desconto gerencial não consegue apagar silenciosamente adicionais obrigatórios apenas comparando o total final com o mínimo bruto do produto.

## 3. Separação público x privado

### DTO público

Consultor/cliente recebe somente:
- `pricingMode = OFFICIAL | MANAGER_ADJUSTED`;
- `totalSellingPrice` final autorizado.

Não recebe:
- mínimo;
- piso protegido;
- markup;
- custo;
- motivo do override;
- flag abaixo do mínimo;
- preço oficial anterior.

### Snapshot privado / auditoria gerencial

Preservar:
- total oficial;
- piso protegido;
- total final;
- tipo do ajuste;
- valor do ajuste;
- se ficou abaixo do mínimo;
- se houve override;
- justificativa;
- ator;
- timestamp.

## 4. Persistência proposta

Não criar tabela paralela de negociação.

A próxima migration deve ser aditiva em `quote_snapshots` e manter snapshots append-only.

Campos propostos:
- `official_total_selling_price numeric`;
- `minimum_allowed_total numeric`;
- `negotiation_private_snapshot jsonb not null`.

`total_selling_price` continua sendo o total final voltado ao cliente/listagem.

Para snapshots legados:
- `official_total_selling_price = total_selling_price`;
- `minimum_allowed_total = total_selling_price` como backfill conservador;
- modo `OFFICIAL`.

Novos snapshots devem persistir os três valores calculados exclusivamente no servidor.

`public_result_snapshot` continua preservando o cálculo oficial original. O service boundary de Quotes passa a projetar o total final a partir de `total_selling_price`, acompanhado do DTO público de negociação.

## 5. RPC v3

Criar versões novas das RPCs de criação/append, sem alterar assinatura das v2 já usadas em produção durante a transição.

As RPCs v3 devem:
- ser `SECURITY INVOKER`;
- usar `search_path = pg_catalog, public`;
- revogar EXECUTE de `PUBLIC`, `anon` e `authenticated`;
- conceder somente a `service_role`;
- continuar usando optimistic locking;
- preservar append-only;
- registrar negociação no evento de snapshot.

A mudança de exposição do Data API prevista pelo Supabase reforça a necessidade de grants explícitos; não depender de privilégios padrão.

## 6. Lifecycle

Negociação só pode gerar novo snapshot quando Quote está `DRAFT`.

Se um Quote já foi `SENT` e houver renegociação:
1. `SENT -> DRAFT`;
2. gerente grava novo snapshot;
3. Quote volta a `SENT`.

`ACCEPTED`, `REJECTED` e `CANCELLED` continuam terminais.

## 7. Segurança

- nenhuma decisão de autorização baseada em metadata editável pelo usuário;
- gerente validado no gateway existente;
- service role permanece somente no backend;
- nenhum novo acesso de browser às tabelas de Quote;
- mínimo e justificativa ficam fora do DTO de consultor;
- sem `SECURITY DEFINER` novo para resolver acesso;
- toda função nova com ACL explícita.

## 8. Gate de Supabase

Esta etapa **não aplica migration remotamente**.

Antes da aplicação:
1. criar a migration com Supabase CLI em ambiente com CLI disponível;
2. validar DDL em transação;
3. testar create/append OFFICIAL;
4. testar ajuste gerencial acima do piso;
5. testar rejeição de consultor;
6. testar rejeição abaixo do piso sem override;
7. testar exceção abaixo do piso com justificativa;
8. testar ACL de RPCs;
9. rodar Security Advisor;
10. somente então solicitar autorização separada para produção.

## 9. Próxima integração

Depois da migration reconciliada:
- integrar `QuoteNegotiationService` ao `SAVE_QUOTE`;
- adicionar ação gerencial no Orçamentista;
- Central e proposta passam a mostrar o total final autorizado;
- proposta do cliente nunca exibe mínimo ou justificativa.
