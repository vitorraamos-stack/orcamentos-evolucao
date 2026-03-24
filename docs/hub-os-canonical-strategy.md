# Hub OS: estratégia canônica

## Diretriz
`os_orders` é o modelo canônico para novas regras.

## Adapter de compatibilidade
`lookupOrderForKiosk` usa:
1. Busca canônica em `os_orders`.
2. Fallback legado em `os` apenas para leitura compatível.

## Dívida remanescente
Algumas telas de board ainda escrevem na tabela `os`. Nesta fase, mantemos compatibilidade para evitar quebra operacional.

## Cutover futuro
- Migrar mutações de `src/modules/hub-os/pages/*` para APIs canônicas.
- Manter fallback de leitura até validação pós-cutover.
