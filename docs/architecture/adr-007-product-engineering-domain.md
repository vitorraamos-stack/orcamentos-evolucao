# ADR-007: Domínio de Engenharia de Produto

**Status:** Aceito
**Data:** 2026-10-03

## Contexto e decisão

`Product` representa algo vendável (por exemplo, Letreiro PVC), e não um material. Materiais, processos, serviços terceirizados e custos fixos são recursos referenciados por componentes; seus nomes, fornecedores, custos e preços permanecem fora deste bounded context.

Cada produto possui `ProductVersion`s numeradas. `versionNumber` identifica uma nova engenharia, enquanto `revision` é o contador de optimistic locking das alterações daquela versão. Ambos começam em 1 e têm finalidades distintas.

O lifecycle é `DRAFT → VALIDATING → PUBLISHED → RETIRED`, com retorno `VALIDATING → DRAFT`. Somente `DRAFT` é editável. A revisão fica congelada em `VALIDATING`; uma correção exige retorno explícito ao draft. Versões publicadas ou retiradas nunca são editadas: uma correção de engenharia publicada cria uma nova versão.

Uma definição de versão é um snapshot JSON-safe composto pela versão, inputs, variáveis e componentes:

- inputs técnicos são `DECIMAL`, `BOOLEAN`, `SELECT` ou `TEXT`; decimais mantêm valores como strings e unidade explícita ou escalar;
- variáveis são expressões AST seguras e podem declarar tipo/unidade esperados;
- componentes são uma união discriminada de `MATERIAL`, `PROCESS`, `OUTSOURCED_SERVICE` e `FIXED_COST`, contendo apenas a referência tipada ao catálogo e regras de quantidade;
- `PER_UNIT` descreve consumo de uma unidade vendida; `PER_QUOTE_ITEM` descreve setup que ocorre uma vez por linha. A expansão por quantidade comercial pertencerá ao Costing/Aggregation context.

## Validação

A validação estrutural protege UUIDs, schemas strict, namespaces, chaves duplicadas e colisões mesmo em drafts. A validação semântica usa o grafo e a inferência do Calculation Engine para relatar referências desconhecidas, ciclos, tipos e incompatibilidades dimensionais.

Um draft estruturalmente íntegro pode ser salvo com referências ainda não resolvidas, apresentadas como issues. O resultado de validação de draft responde se o snapshot é persistível e é um tipo distinto do resultado de publicação. Entrar em `VALIDATING` ou `PUBLISHED` exige explicitamente um resultado de publicação sem erros; retornar de `VALIDATING` para `DRAFT` e retirar uma versão publicada não executam esse gate. Conditions devem retornar boolean; quantidades devem retornar decimal compatível dimensional e semanticamente com `quantityUnit`. A não negatividade do resultado de consumo é uma invariante de runtime futura; esta modelagem não tenta provar estaticamente expressões arbitrárias.

## Limites deliberados

Não existem custo, preço, margem, imposto, comissão ou fornecedor neste modelo. `commercial_quantity` não é input nem símbolo implícito da Engenharia: pertence ao futuro `QuoteItem`. Não há persistência, migration, API ou integração com banco nesta decisão.
