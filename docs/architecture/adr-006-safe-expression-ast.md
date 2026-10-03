# ADR-006: AST segura e modelo de avaliação

## Status

Aceita.

## Decisão

Fórmulas têm como formato canônico uma AST JSON, atualmente versionada por
`EXPRESSION_AST_VERSION = "1.0"`. A representação persistível contém somente
objetos, arrays, strings e booleanos JSON; texto de fórmula não é autoridade.
Uma interface textual futura deverá usar um parser seguro e armazenar apenas a
AST validada.

Não há nós para JavaScript e o motor não usa avaliação dinâmica. Operadores e
funções pertencem a allowlists fechadas. O avaliador é puro: recebe AST e
contexto, não consulta relógio, estado global, rede, banco ou filesystem.

A validação estrutural usa schemas estritos e é separada da inferência estática
de tipos e dimensões. Literais com unidade derivam seus metadados do catálogo;
operações delegam ao núcleo decimal e dimensional existente.

Variáveis formam um grafo pelas referências extraídas das ASTs. Inputs e
contexto são nós externos; referências a variáveis são arestas. Uma busca em
profundidade determinística valida referências, produz a ordenação topológica e
reporta ciclos, inclusive autorreferências.

## Segurança e limites

Cada expressão é limitada a profundidade 64, 1.000 nós e 32 argumentos por
chamada. Chaves reservadas e chaves associadas a prototype pollution são
rejeitadas. Novos operadores, funções ou nós exigem alteração explícita do
schema, da inferência e do avaliador, além de eventual evolução da versão da AST.
