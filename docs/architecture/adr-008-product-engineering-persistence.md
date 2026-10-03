# ADR-008: Persistência da Engenharia de Produto

**Status:** Aceito
**Data:** 2026-10-03

## Contexto

O modelo de domínio da Engenharia de Produto definido no ADR-007 precisa de uma
base relacional que preserve seu aggregate e seu lifecycle sem acoplar o novo
contexto aos cadastros legados. `Product` continua sendo algo vendável, não um
material. Preço, custo, margem, imposto, comissão e quantidade comercial não
fazem parte desta persistência.

## Decisão

Persistiremos o catálogo vendável em `products` e cada engenharia numerada em
`product_versions`. Inputs, variáveis e componentes pertencem a uma versão por
FK, nas tabelas `product_inputs`, `product_variables` e `product_components`.
Não há coluna de tenant: esta primeira fundação é deliberadamente single-tenant.

Decimais de inputs usam `numeric`, sem conversão por ponto flutuante. Expressões
seguras são ASTs JSON em `jsonb`; validação semântica continua responsabilidade
do domínio. Um componente guarda `type` e `resource_id`, sem FK para `materials`
ou outro catálogo legado. Assim, referências tipadas não confundem Product com
Material e os futuros bounded contexts podem estabelecer seus próprios
contratos.

`version_number` identifica a engenharia e é único por produto; `revision`
implementa optimistic locking dentro do draft. Um índice parcial permite apenas
uma versão `PUBLISHED` por produto.

## Lifecycle e integridade

Uma versão nasce em `DRAFT`, com revisão 1. Alterações no próprio draft exigem
incremento unitário da revisão. As transições admitidas são:

- `DRAFT → VALIDATING`;
- `VALIDATING → DRAFT`;
- `VALIDATING → PUBLISHED`;
- `PUBLISHED → RETIRED`.

Em `VALIDATING`, o snapshot fica congelado; somente a transição explícita de
volta para `DRAFT` ou adiante para `PUBLISHED` é aceita. A engenharia publicada
não pode ser editada e apenas pode ser retirada. Uma versão `RETIRED` é
totalmente imutável. Metadados de publicação são obrigatórios em `PUBLISHED` e
`RETIRED` e proibidos nos estados anteriores.

Triggers nas três tabelas filhas permitem `INSERT`, `UPDATE` e `DELETE` somente
quando a versão pai está em `DRAFT`. Exclusões são restritivas, evitando que uma
cascade contorne as regras do aggregate. As funções de trigger usam a segurança
do invocador; nenhuma função `SECURITY DEFINER` é introduzida.

## Autorização

RLS está habilitado nas cinco tabelas. Todas as operações do papel
`authenticated` exigem `public.is_manager(auth.uid())`; `anon` não recebe
privilégios. As regras de lifecycle permanecem adicionais à autorização, de
modo que nem managers podem alterar snapshots congelados ou imutáveis.

## Consequências

Esta migration cria somente a fundação de persistência. Ela não altera Hub OS,
Calculadora, APIs ou UI, não resolve referências de recursos e não publica nem
aplica dados. A validação de AST, unidades, dependências e prontidão para
publicação permanece no Product Engineering domain antes da transição de estado.
