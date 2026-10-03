# ADR-004 — Precisão decimal

**Status:** substituído pelo ADR-005 no contrato 1.1.0

## Decisão

Contratos calculáveis e financeiros usam decimal strings validadas, preservando serialização
JSON e precisão textual. JavaScript `number` não será autoridade para cálculos financeiros.

O banco usará futuramente `numeric`. O runtime decimal e os limites operacionais, introduzidos
na camada seguinte da fundação, estão definidos no ADR-005. Políticas comerciais de
arredondamento continuam explícitas e versionadas, nunca efeitos implícitos de ponto flutuante.
