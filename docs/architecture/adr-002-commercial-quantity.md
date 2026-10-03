# ADR-002 — Quantidade comercial e expansão

**Status:** aceito — contratos 1.0.0

## Decisão

Engineering trabalha por uma unidade comercial. `commercialQuantity` pertence ao futuro
`QuoteItem` e permanece separada dos inputs técnicos; não é um input configurável de produto.

`PER_UNIT` descreve consumo ou custo para uma unidade comercial. Engineering não o multiplica
por `commercialQuantity`. `PER_QUOTE_ITEM` ocorre uma vez na linha e é o escopo padrão de setup.
Não há `BATCH_DEPENDENT` no MVP.

Costing Aggregation será o único proprietário da expansão (`COSTING_AGGREGATION`), observando:

```text
totalProductionCost =
  (unitVariableCost * commercialQuantity) + quoteItemFixedCost
```

A equação é somente um invariante; este commit não implementa Costing.
