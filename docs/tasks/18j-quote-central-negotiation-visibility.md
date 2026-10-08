# 18J — Visibilidade da negociação na Central de Orçamentos

Status: **camada de aplicação preparada; mudança SQL pendente de autorização separada**.

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

Enquanto o banco ainda não devolver `pricing_mode`, o servidor interpreta ausência/null como `OFFICIAL`. Isso permite implantar a camada de aplicação sem quebrar o runtime atual.

Se o banco devolver um valor inesperado, o servidor falha com `QUOTE_PERSISTENCE_COMPATIBILITY_ERROR` em vez de fazer downgrade silencioso.

## UI

A Central continua mostrando o total final e adiciona um badge discreto **Ajuste gerencial** apenas quando `pricingMode = MANAGER_ADJUSTED`.

## SQL pendente

A evolução de `quote_list_secure` deve derivar somente o modo sanitizado:
- `MANAGER_FINAL_PRICE` privado -> `MANAGER_ADJUSTED`;
- qualquer snapshot legado/official -> `OFFICIAL`.

A função deve continuar:
- SECURITY INVOKER;
- search_path fixo `pg_catalog, public`;
- EXECUTE apenas para `service_role`;
- sem acesso de `anon` ou `authenticated`.

Nenhum JSON privado deve ser retornado.
