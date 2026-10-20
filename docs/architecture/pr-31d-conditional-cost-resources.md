# PR 31D — seleção condicional de componentes antes da consulta às tarifas

## Objetivo
Corrigir a ordem de avaliação do motor oficial de custos: as condições dos
componentes devem ser avaliadas **antes** de o backend carregar recursos e
tarifas. Uma espessura de PVC não pode depender da tabela de preços das seis
outras espessuras nem da tinta não utilizada.

## Regra única
`shared/costing/componentResolution.ts` reúne a resolução dos parâmetros
técnicos administrados pelo servidor, defaults e variáveis da engenharia,
valida a versão PUBLISHED e a quantidade comercial e avalia as condições
de todos os componentes numa ordem determinística (sortOrder + ID).

O backend usa a decisão de inclusão dessa função para buscar somente os
recursos necessários, deduplicados e ordenados por tipo/ID. A apuração
`aggregateCosting` reutiliza a **mesma** função, sem criar regra paralela.

Para cada componente não aplicável, o resultado preserva `included:false`,
`conditionResult:false`, a referência do recurso e contribuições zeradas,
sem buscar recurso ou tarifa. Componentes com condição verdadeira precisam
sempre de recurso ativo e tarifa vigente, **mesmo quando sua quantidade é
zero**. Todos os preços e parâmetros permanecem do lado do servidor.

## Regressões cobertas
- Sete espessuras do PVC (2, 3, 5, 10, 15, 20 e 30 mm): busca somente a
  tarifa de corte CNC da espessura escolhida; não busca tinta quando zero cores.
- Deduplcação de referências aplicáveis, ordenação determinística e
  resultado oficial independente do momento de seleção.
- Auditoria completa dos excluídos, condição falsa e quantidade zero;
  ausência de tarifa para componente aplicável continua bloqueando cálculo.
- Validação prévia de versão publicada, campos técnicos e parâmetros
  protegidos de alteração pelo navegador.
- Nenhuma migration, nenhuma nova rota, sem alteração de UI, biblioteca,
  propostas, histórico ou lógica de transferência para Conta Azul.

## Publicação
Criar PR isolado e validar `npm run verify:prod`. Não fazer merge, deploy
ou alterações na produção sem autorização separada.
