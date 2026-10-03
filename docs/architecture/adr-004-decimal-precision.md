# ADR-004 — Precisão decimal

**Status:** aceito — contratos 1.0.0

## Decisão

Contratos calculáveis e financeiros usam decimal strings validadas, preservando serialização
JSON e precisão textual. JavaScript `number` não será autoridade para cálculos financeiros.

O banco usará futuramente `numeric`, e o motor financeiro futuro usará uma biblioteca Decimal.
Nenhuma biblioteca ou aritmética decimal é introduzida nesta fundação. Políticas de
arredondamento serão explícitas e versionadas, nunca efeitos implícitos de ponto flutuante.
