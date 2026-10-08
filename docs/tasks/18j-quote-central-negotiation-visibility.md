# 18J — Visibilidade da negociação na Central de Orçamentos

Status: **aplicação + SQL production implementados; aguardando CI/Preview final e merge**.

## Objetivo

Fazer a Central de Orçamentos identificar visualmente quando o total final foi autorizado por gerente, sem expor qualquer informação comercial protegida.

## Contrato sanitizado

Cada item da listagem passa a ter:
- `pricingMode: OFFICIAL | MANAGER_ADJUSTED`;
- `totalSellingPrice`, que continua sendo o total final do snapshot.

Nunca entram na listagem:
- mínimo protegido;
- preço oficial interno separado;
- justificativa;
- flag de below-minimum;
- evidência de override;
- costing/markup/financial rate.

## Compatibilidade

Enquanto o banco não devolver `pricing_mode`, o servidor interpreta ausência/null como `OFFICIAL`.

Se o banco devolver um valor inesperado, o servidor falha com `QUOTE_PERSISTENCE_COMPATIBILITY_ERROR` em vez de fazer downgrade silencioso.

## UI

A Central continua mostrando o total final e adiciona um badge discreto **Ajuste gerencial** apenas quando `pricingMode = MANAGER_ADJUSTED`.

## SQL production

Migration aplicada:
- `20261008153453_quote_list_pricing_mode_18j`.

`quote_list_secure` deriva somente o modo sanitizado:
- snapshot legado/null -> `OFFICIAL`;
- `OFFICIAL` -> `OFFICIAL`;
- `MANAGER_FINAL_PRICE` -> `MANAGER_ADJUSTED`;
- modo inesperado -> `INVALID`, que o servidor rejeita como incompatibilidade.

A função permanece:
- SECURITY INVOKER;
- STABLE;
- search_path fixo `pg_catalog, public`;
- EXECUTE apenas para `service_role`;
- sem acesso de `anon` ou `authenticated`.

Nenhum JSON privado é retornado.

## Pós-check production

- Quotes: 0;
- Quote snapshots: 0;
- retorno smoke: `{ items: [], total: 0 }`;
- `security_definer = false`;
- `search_path = pg_catalog, public`;
- `service_role EXECUTE = true`;
- `anon/authenticated EXECUTE = false`;
- Security Advisor sem finding nova atribuída à 18J.
