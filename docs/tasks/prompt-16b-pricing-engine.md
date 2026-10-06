# Prompt 16B — Pricing Engine puro

Status: arquitetura proposta, pronta para implementação em branch isolada após disponibilidade de 16A. Não autoriza merge, persistência, endpoint público, ativação comercial ou migration. Nenhuma configuração da empresa foi escolhida.

## Base e escopo

Repository: `vitorraamos-stack/orcamentos-evolucao`.
Dependência: contratos do PR #418, SHA `5354a90b409845f3e52889a0be4af5225d82d8ed`.
Se 16A continuar aberto, criar branch a partir de sua head e PR empilhado com base `feat/pricing-domain-contracts`; não fazer merge. Verificar novamente a head antes de começar. Se 16A mudar, revisar compatibilidade.

Implementar apenas motor puro em `shared/pricing`, erros, contratos Zod-first, fixtures e testes. Não tocar Costing, Engineering, Home.tsx, materials, price_tiers, API, UI, Supabase, migrations, package/lockfile ou configuração de deploy. Manter exports explícitos. Pricing schema e versão do algoritmo são conceitos distintos; adicionar `PRICING_ENGINE_VERSION = "1.0"` sem substituir `PRICING_SCHEMA_VERSION`.

O cálculo puro é reutilizável em teste, mas não confere autoridade a seu chamador. Uso oficial futuro é exclusivamente server-side. Não conectar ao browser neste prompt.

## Contratos propostos

Todos os objetos novos são strict, derivados por `z.infer`, sem defaults de estratégia, taxa, margem, markup, base ou arredondamento. Não converter valores financeiros por Number, parseFloat, unary plus, toNumber ou JS float. Inteiros usados para índices, limites e revisões não são valores financeiros.

- `PricingMarkup`: DecimalString não negativo, sujeito aos limites operacionais existentes. Não reutilizar PricingRate: markup pode ser igual ou superior a 1. Rejeitar number, expoentes e texto localizado.
- `PricingCharge`: `{ id: UUID, kind: PricingChargeKind, rate: PricingRate, percentageBase: PricingPercentageBase }`. Array readonly com IDs únicos. Permitir encargos distintos do mesmo kind; não presumir que toda comissão ou imposto use uma base única. Validar limite técnico de coleção documentado (proposta: 64 encargos, não regra comercial). `charges: []` é ausência explicitamente fornecida, nunca default.
- `PricingStrategy`: união discriminada por `type`. GROSS_UP exige `targetMargin: PricingRate` e `marginBase: "SELLING_PRICE"`. MARKUP_ON_COST exige `markup: PricingMarkup` e `markupBase: "TOTAL_COST" | "COST_PLUS_COST_BASED_CHARGES"`. Proibir propriedades da outra estratégia. A escolha da base real permanece de Vitor/Marcos.
- `PricingPolicyVersionDefinition`: envelope strict contendo `schemaVersion: literal("1.0")`, `version: pricingPolicyVersionSchema`, `strategy`, `charges`. Preservar os contratos de metadata de 16A. Nenhuma taxa no envelope de metadata sozinho. Toda modificação da definição altera revision futura, inclusive children.
- `PricingCostBasis`: envelope interno strict com `totalCost` reutilizando Money existente, UUIDs do produto/versão, `productVersionNumber`, `productVersionRevision`, `costingAggregationVersion: literal("1.0")`, `effectiveCostAt` e `commercialQuantity`. Validar amount >= 0 e quantity > 0, também operacionalmente. Pricing não recebe componentes, insumos, resource rates ou ASTs.
- `PricingEngineInput`: `{ policy, definition, costBasis }`; policy ACTIVE, version PUBLISHED e `definition.version.pricingPolicyId === policy.id`. Verificar compatibilidade de schema e algorithm sem aceitar fallback.
- `PricingEngineResult`: engineVersion, schemaVersion, identidade/revision da policy version, identidade/revision do produto, aggregation version, effectiveCostAt, quantity, estratégia, precisão técnica identificada, `unroundedTotalSellingPrice: Money`. Breakdown privado: totalCost, cost-based charges, selling-price-based charges, profitAmount, realizedMargin quando P > 0. Resultado não é preço comercial final nem DTO do consultor.
- `PricingPublicationValidationResult`: lista fechada de erros de prontidão, sem custo real. Validar definição/IDs/estratégia/limites/soma de taxas e denominador; não publicar nem atualizar estado. Readiness aceita DRAFT/VALIDATING; cálculo oficial puro exige PUBLISHED. Não passar uma versão falsa PUBLISHED para validar draft.

Money permanece `{ currency: "BRL", amount: DecimalString }`; adicionar constraints ao schema de entrada de Pricing sem modificar o Money global. Validar definição PUBLISHED não substitui carregar sua origem no servidor.

## Matemática genérica

C = totalCost já expandido pelo Official Costing. q = commercialQuantity, apenas proveniência: **não multiplicar C por q novamente**.
a = soma das rates dos encargos TOTAL_COST.
b = soma das rates dos encargos SELLING_PRICE.
B = C × (1 + a).
Cada encargo usa sua base explicitamente, sem cascata ou juros compostos implícitos.

GROSS_UP, margem m sobre preço de venda:

`P = B / (1 - b - m)`

`profit = P - C - aC - bP = mP`.

MARKUP_ON_COST, markup k e base X explícita:

`X = C` para TOTAL_COST; `X = B` para COST_PLUS_COST_BASED_CHARGES.

`P = (B + kX) / (1 - b)`

`profit = P - C - aC - bP = kX`.

Exigir denominador estritamente positivo. Não confundir markup, margem ou coeficiente multiplicador: k é acréscimo fracionário, e fator multiplicador é 1+k. Não aplicar a mesma margem junto com markup. Nenhuma dessas fórmulas seleciona estratégia real para a empresa.

Para C = 0 e denominador válido, P = 0 e profit = 0. realizedMargin é null, pois 0/0 é indefinido; isso não cria regra de preço mínimo. Se o produto real não puder ter custo zero, sua elegibilidade comercial deverá ser definida separadamente.

## Precisão, determinismo e limites

O runtime atual de decimal.js usa 50 dígitos significativos e half-even COMPUTACIONAL (ADR-005). Isso não é arredondamento para centavos, múltiplos ou preço comercial. Não chamar roundDecimal nem toDecimalPlaces(2) como decisão comercial.

Há um risco concreto: 16A aceita rates com 100 noves decimais e o runtime recebe até 500 casas. Somar taxas e depois subtrair de 1 em precisão 50 pode transformar um denominador positivo em zero. Logo, apenas compor addDecimal/subtractDecimal para formar denominadores não atende toda a entrada admitida.

Proposta técnica para 16B: helper local de racional exato em `shared/pricing`, baseado em inteiros BigInt extraídos de DecimalString, nunca de JS number. Usar escala decimal/potências de 10 e redução por gcd; operações algébricas exatas para agregados, denominadores, P, encargos e lucro. Limites de texto, casas e magnitude da entrada continuam os do gateway decimalFrom existente; limite de coleção e de intermediários devem ser explícitos e testados. Reutilizar Money, DecimalString e schemas existentes; não editar o runtime central.

Serialização final do racional deve ser determinística, não exponencial, com 50 dígitos significativos e half-even COMPUTACIONAL, identificada como `DECIMAL_50_HALF_EVEN_V1`. Preferir algoritmo inteiro de quociente/resto, com desempate par e carry, isolado e testado; nunca confundir casas decimais com dígitos significativos. Normalizar -0 para 0. Validar resultado com DecimalString e limites operacionais existentes; falhar com erro de limite se resultado serializado não puder ser consumido pelo gateway decimalFrom. Não arredondar intermediários nem somar valores de breakdown já serializados para obter P.

Invariantes algébricas são exatas internamente. Campos de saída serializados podem apresentar residual nos últimos dígitos; não afirmar igualdade textual entre soma dos campos arredondados tecnicamente e o total. Testes usam oracle racional independente e tolerância derivada da precisão técnica, nunca um epsilon comercial escolhido. Acrescentar testes de divisões periódicas, carry e invariância à ordem dos encargos.

Se a equipe optar por dispensar o helper racional, documentar alternativa e provar ausência de perda nos limites admitidos antes da implementação; não reduzir silenciosamente o intervalo de PricingRate nem mudar o ADR-005. Esta é uma decisão técnica de implementação, não uma decisão de preço da empresa.

## Funções e erros

Separar: validatePricingPolicyVersionDefinition; validatePricingPublicationReadiness; calculatePricing; helpers privados de matemática e serialização. Não executar I/O, relógio, randomness, loader ou rede no motor. Não alterar objetos/arrays de entrada.

Expandir vocabulário de PricingDomainError com códigos fechados:

- INVALID_PRICING_DEFINITION / INVALID_PRICING_COST_BASIS / INVALID_PRICING_MARKUP;
- UNSUPPORTED_PRICING_SCHEMA_VERSION / UNSUPPORTED_COSTING_AGGREGATION_VERSION;
- PRICING_POLICY_NOT_ACTIVE / PRICING_POLICY_VERSION_MISMATCH;
- DUPLICATE_PRICING_CHARGE / INVALID_PRICING_DENOMINATOR;
- PRICING_NUMERIC_LIMIT_EXCEEDED / INVALID_PRICING_ENGINE_RESULT.

Reutilizar PRICING_POLICY_VERSION_NOT_PUBLISHED. Mapear erro decimal/racional para código de Pricing sem capturar e mascarar bugs de programação. Validation pode oferecer issues privadas; nenhum payload sensível deverá ser serializado pelo endpoint futuro. Erros de policy incompatível no servidor são falhas internas com mensagem pública sanitizada, não responsabilidade do consultor.

## Matriz mínima de testes

Todos os números abaixo são fixtures sintéticas TEST_ONLY, sem seed, default, exemplo de proposta comercial ou uso em produção.

| Caso | C | a | b | Estratégia | P esperado exato |
|---|---|---|---|---|---|
| Identidade | 80 | 0 | 0 | GROSS_UP m=0 | 80 |
| Margem isolada | 80 | 0 | 0 | GROSS_UP m=0.2 | 100 |
| Encargo sobre custo | 80 | 0.25 | 0 | GROSS_UP m=0.2 | 125 |
| Encargo sobre venda | 80 | 0 | 0.2 | GROSS_UP m=0 | 100 |
| Misto | 80 | 0.25 | 0.2 | GROSS_UP m=0.3 | 200 |
| Markup sobre C | 80 | 0.25 | 0.2 | k=0.5; X=C | 175 |
| Markup sobre B | 80 | 0.25 | 0.2 | k=0.5; X=B | 187.5 |
| Markup >= 1 | 80 | 0 | 0 | k=1.5; X=C | 200 |
| Decimais curtos | 0.1 | 0 | 0 | k=0.2; X=C | 0.12 |
| Periódico | 1 | 0 | 0 | GROSS_UP m=0.3 | 10/7; serializar a 50 dígitos |
| Custo zero | 0 | 0.25 | 0.2 | GROSS_UP m=0.3 | 0; margem realizada null |
| Expansão já realizada | 80; q=4 | 0 | 0 | GROSS_UP m=0.2 | 100, não 400 |
| Denominador zero | 80 | 0 | 0.7 | GROSS_UP m=0.3 | INVALID_PRICING_DENOMINATOR |
| Denominador negativo | 80 | 0 | 0.8 | GROSS_UP m=0.3 | INVALID_PRICING_DENOMINATOR |
| Denominador positivo minúsculo | 1 | 0 | 100 noves após ponto | GROSS_UP m=0 | 10^100, sem falso zero |

Cobrir adicionalmente: todos os enum values e unknown; propriedades extras em cada objeto aninhado; numbers/NaN/Infinity/expoentes/comma/whitespace; IDs inválidos e repetidos; FK semântica errada; ACTIVE/INACTIVE/ARCHIVED; os quatro estados da versão; publication metadata; amount negativo, quantity zero/negativa; BRL incompatível; definição sem campos obrigatórios; mix indevido margem/markup; taxas individuais >=1; soma >=1; limites 500/501 casas, 1024/1025 caracteres, magnitude, coleção e intermediários; muito perto de 1; ordem de encargos; mesmos kinds distintos; bases distintas; input congelado/deep freeze; nenhum mutation; determinismo; erro estável; exports; erro operacional sem vazamento. Snapshot numérico de resultado não implica persistência de orçamento.

Testes de propriedade com fixtures determinísticas: monotonicidade em C/m/k dentro do domínio; homogeneidade em C sem arredondamento comercial; neutralidade de rate zero; conservação de lucro racional; rate e quantity não passam por float. Não adicionar dependência para isso.

## Integração futura com Official Costing

Somente estudar/documentar neste prompt. Não adicionar endpoint em 16B.
`OfficialPricingCalculationService` futuro, em `api/_shared/pricing`, chama diretamente `OfficialCostingCalculationService.calculate`, existente em `api/_shared/costing/calculationService.ts`. Não faz fetch ao endpoint gerente e não pede que o browser devolva um costing previamente calculado.

Servidor autentica/autoriza ator, resolve policy ACTIVE e versão PUBLISHED por vinculação aprovada, carrega definição autoritativa e captura identidade/revision. Cálculo usa o custo total retornado pelo Official Costing; projetar apenas PricingCostBasis. Product version solicitada precisa ser elegível no servidor.

Browser futuro envia somente versão de produto + CalculationRequest e referência pública de cenário de pagamento se futuramente aprovada; não pode enviar cost, rates, margin, commission, tax, policy override, effectiveCostAt ou finalPrice. PolicyVersionId enviado para substituir seleção oficial é proibido. Seleção de política por produto/cenário é decisão pendente, não inferir de materiais legados.

DTO de consultor usa allowlist estrita: referência do cálculo, produto/versão, quantidade, total comercial quando aprovado e metadados públicos indispensáveis. Nenhum totalCost, unitCost, componente, resource, rate, margem, comissão, imposto, lucro ou breakdown. Testar ausência recursiva de dados financeiros privados e redaction de logs. Não expor `unroundedTotalSellingPrice` como preço final comercial.

O endpoint atual `/api/costing/calculate` permanece restrito a gerente/admin; não ampliar sua autorização. Encapsulamento no servidor não basta: o futuro endpoint de Pricing precisa de sua própria autenticação, module access, autorização e DTO.

Official Costing hoje realiza múltiplas leituras sequenciais; não afirmar snapshot transacional dos recursos. Registrar referências temporais/proveniência; atomicidade forte entre cost rates, política e Quote snapshot exige projeto futuro. Não escrever preço real enquanto essas garantias e regras comerciais estiverem pendentes.

## Travas e aceite

Auditar dependências para ausência de Home.tsx calculator, price_tiers, materials.min_price e legacy como fonte oficial. Sem regras comerciais implícitas. Sem mínimos, descontos, impostos escolhidos, taxas financeiras escolhidas ou arredondamento comercial. Sem fallback zero para configuração ausente. Parar apenas a parte que exigir decisão comercial e registrar pergunta.

Executar npm ci, npm run build (check + suíte + bundle), git diff --check e revisão integral do diff. Conferir CI e Preview do SHA final via read-only. Criar/pushar branch e PR sem merge nem deploy manual; relatar SHAs, testes, escopo e ausência de Supabase. Sem supabase apply_migration/execute_sql/db push/db reset/migration repair.
