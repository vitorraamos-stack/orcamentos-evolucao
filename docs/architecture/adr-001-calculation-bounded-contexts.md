# ADR-001 — Fronteiras do cálculo

**Status:** aceito — contratos 1.0.0

## Decisão

O fluxo de contextos é unidirecional: **Engineering → Costing → Pricing → Quotes → Operations**.
Os contratos compartilhados ficam na raiz `shared/calculation-engine`, importável por `api/` e
`src/modules/` sem fazer um desses ambientes depender do outro.

São invariantes arquiteturais:

- Operations não contém finanças;
- Pricing não conhece detalhes de fabricação;
- Engineering não conhece margem;
- Costing não conhece Quote;
- o cálculo oficial será server-side;
- o snapshot futuro será imutável;
- IA não será o motor financeiro; e
- produto vendável é diferente de material/insumo.

Este ADR define fronteiras, não implementa nenhum desses motores ou contextos.
