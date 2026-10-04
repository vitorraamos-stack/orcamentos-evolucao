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
do domínio. Cada versão registra `schema_version` e `expression_ast_version`,
ambas inicialmente fixadas em `1.0`, para que o runtime não carregue
silenciosamente um contrato que não compreende. `created_by` e `published_by`
referenciam `profiles`, a identidade de aplicação usada por usuários
operacionais e roles.

Variáveis preservam separadamente `expected_value_type`, `expected_unit` e
`enforce_expected_unit`. Com enforcement desligado não há expectativa de
unidade; ligado com unidade nula representa um decimal escalar; ligado com uma
UnitId representa um decimal naquela unidade. Inputs, variáveis e componentes
aceitam somente as UnitIds do domínio. Os payloads específicos de inputs usam
as colunas `decimal_*`, `boolean_default`, `select_*` e `text_*`; opções de
SELECT são arrays JSON não vazios, enquanto unicidade e presença do default nas
opções permanecem invariantes do domínio TypeScript.

Componentes formam uma união discriminada por `component_type`. Exatamente uma
entre `material_id`, `process_definition_id`, `outsourced_service_id` e
`fixed_cost_definition_id` deve estar preenchida, de acordo com o discriminante.
Esses UUIDs permanecem deliberadamente sem FKs: os três novos catálogos ainda
não existem e `materials` pertence ao legado. Portanto, esta fundação não possui
dependência do cadastro legado de materiais; os futuros bounded contexts
estabelecerão seus próprios contratos.

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
quando a versão pai está em `DRAFT`. Antes de validar o namespace compartilhado
de inputs e variáveis ou alterar um child, o trigger bloqueia a linha da versão
pai com `SELECT ... FOR UPDATE`. O lock serializa mutações de children entre si
e com transições de lifecycle, impedindo alterações concorrentes após o
congelamento. Exclusões são restritivas, evitando que uma cascade contorne as
regras do aggregate. As funções de trigger usam a segurança do invocador;
nenhuma função `SECURITY DEFINER` é introduzida.

Produtos não admitem exclusão física: devem receber status `ARCHIVED`. Além da
ausência de policy e grant de `DELETE`, um trigger rejeita a operação mesmo em
caminhos privilegiados que contornem RLS.

## Autorização

RLS está habilitado nas cinco tabelas e o acesso é exclusivo de managers; não há
ampliação de acesso para consultores e `anon` não recebe privilégios. Em
`products`, policies explícitas permitem apenas `SELECT`, `INSERT` e `UPDATE`.
Nas tabelas de versões e children, managers também podem solicitar `DELETE`,
sempre sujeitos aos triggers de lifecycle. Essas regras permanecem adicionais à
autorização, de modo que nem managers podem alterar snapshots congelados ou
imutáveis.

## Consequências

Esta migration cria somente a fundação de persistência. Ela não altera Hub OS,
Calculadora, APIs ou UI, não resolve referências de recursos e não publica nem
aplica dados. A validação de AST, unidades, dependências e prontidão para
publicação permanece no Product Engineering domain antes da transição de estado.
