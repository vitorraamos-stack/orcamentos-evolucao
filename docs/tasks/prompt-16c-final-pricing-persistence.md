# Prompt 16C Final — Pricing Persistence e configuração comercial

Status: **arquitetura final de persistência, pronta para implementação em branch isolada**. Este documento consolida as decisões comerciais aprovadas após 16A/16B. **Não autoriza aplicar migration, executar SQL no Supabase remoto, ativar endpoint público, integrar UI nem alterar produção.**

Base técnica aprovada:
- 16A: contratos de Pricing integrados ao `main`.
- 16B: Pure Pricing Engine integrado ao `main` pelo PR #420.
- `PRICING_SCHEMA_VERSION = "1.0"`.
- `PRICING_ENGINE_VERSION = "1.0"`.
- `PRICING_TECHNICAL_PRECISION = "DECIMAL_50_HALF_EVEN_V1"`.
- Product Engineering segue service boundary server-side do ADR-009; Pricing deve seguir o mesmo princípio.
- Persistência é single-tenant. Não criar `tenant_id`, novos papéis ou autorização paralela.

## 1. Decisões comerciais aprovadas

1. Cada produto possui no máximo uma configuração oficial de Pricing.
2. A associação é por `product_id`, não por `product_version_id`.
3. Uma mesma Pricing Policy pode ser compartilhada por vários produtos.
4. Não criar entidade de família/categoria apenas para Pricing.
5. A publicação de policy version tem vigência imediata; não há `valid_from`/`valid_until` nesta versão.
6. Existe no máximo uma versão `PUBLISHED` por policy.
7. Publicar nova versão retira a anterior e publica a nova atomicamente.
8. Estratégia comercial oficial: `MARKUP_ON_COST`.
9. Base oficial do markup: `TOTAL_COST`.
10. Markup é configurado por policy e somente gerente pode alterá-lo.
11. Não há imposto, comissão ou taxa administrativa como encargo de policy nesta versão.
12. Parcelamento é configuração global da empresa, independente do produto/policy.
13. De 1x a 3x a taxa financeira padrão é zero.
14. De 4x a 12x existe taxa financeira configurável por quantidade de parcelas.
15. Taxa financeira é recuperada sobre `SELLING_PRICE`.
16. Consultor escolhe a quantidade de parcelas, mas não altera taxas.
17. Somente gerente altera taxas globais e pode realizar override da taxa em um orçamento específico.
18. Preço mínimo é específico por produto.
19. Somente gerente configura o preço mínimo.
20. Preço mínimo é aplicado depois do markup e antes da taxa financeira.
21. O resultado comercial é apresentado com duas casas decimais; não existe arredondamento para múltiplos de R$ 5/R$ 10/etc.
22. Consultor não altera preço calculado e não concede desconto.
23. Gerente pode ajustar o preço final/conceder desconto no futuro Quotes.
24. Gerente pode excepcionalmente vender abaixo do mínimo somente por override explícito com justificativa obrigatória.
25. Alterações em taxa global e preço mínimo têm vigência imediata para novos cálculos e devem possuir revision + auditoria.
26. Orçamentos emitidos são snapshots imutáveis; mudanças futuras de policy, mínimo ou taxa não recalculam orçamentos anteriores.
27. Alteração de orçamento emitido cria nova revisão no futuro bounded context Quotes.

### Decisão residual que NÃO bloqueia a persistência

A política comercial de arredondamento já definiu **duas casas decimais**, porém o desempate exato de meio centavo ainda não foi formalmente aprovado (`HALF_UP`, `HALF_EVEN`, etc.). Portanto:
- 16C não persiste uma regra de arredondamento;
- não inventar o tie-break em migration/service;
- a decisão deve ser fechada antes da camada de preço comercial final/Quotes;
- a precisão técnica interna do engine continua sendo `DECIMAL_50_HALF_EVEN_V1` e não deve ser confundida com arredondamento comercial.

## 2. Separação de responsabilidades

### Pricing Policy

Responsável por transformar o custo oficial em **preço-base técnico**, usando somente a estratégia aprovada:

`MARKUP_ON_COST` + `TOTAL_COST`.

Para custo oficial `C` e markup fracionário `k`:

`P_base = C × (1 + k)`.

Na persistência v1, a definição oficial carregada para o Pure Pricing Engine deve produzir:

- `strategy.type = "MARKUP_ON_COST"`;
- `strategy.markupBase = "TOTAL_COST"`;
- `strategy.markup = <DecimalString persistido>`;
- `charges = []`.

Não adicionar taxa de parcelamento em `pricing_policy_charges`.

### Regra de mínimo do produto

Após `P_base`:

`P_min = max(P_base, minimumSellingPrice)`.

O mínimo é configuração do produto e não da policy.

### Regra financeira de pagamento

Depois do mínimo, resolver a taxa financeira `f` pela condição de pagamento.

Para taxa sobre `SELLING_PRICE`:

`P_fin = P_min / (1 - f)`.

Exigir `0 <= f < 1` e denominador positivo.

Para 1x–3x, `f = 0`.

Para 4x–12x, usar a taxa global configurada, exceto quando existir futuro override gerencial autorizado para aquele orçamento.

### Arredondamento comercial

Depois de `P_fin`, a futura camada comercial converte para duas casas decimais com o tie-break ainda pendente.

### Negociação / desconto

Ajuste ou desconto gerencial acontece **depois** do preço calculado e pertence ao futuro Quotes. Nunca sobrescrever o resultado técnico de Pricing.

Se o valor negociado ficar abaixo do mínimo do produto:
- exigir gerente;
- exigir override explícito;
- exigir justificativa;
- preservar mínimo vigente e valor autorizado no snapshot.

## 3. Tabelas a implementar no 16C

### 3.1 `public.pricing_policies`

Responsabilidade: identidade reutilizável da política comercial.

Campos previstos:
- `id uuid PK`;
- `code text UNIQUE NOT NULL`;
- `name text NOT NULL`;
- `description text NULL`;
- `status text NOT NULL`: `ACTIVE | INACTIVE | ARCHIVED`;
- `revision integer NOT NULL`, inicia em 1;
- `created_at timestamptz NOT NULL`;
- `created_by uuid NOT NULL -> profiles(id) RESTRICT`;
- `updated_at timestamptz NOT NULL`;
- `updated_by uuid NOT NULL -> profiles(id) RESTRICT`.

Invariantes:
- code segue o padrão técnico já usado em Product/Pricing;
- name não pode ser vazio;
- revision > 0;
- sem DELETE físico;
- alteração de metadata/status exige `expectedRevision` e incrementa revision exatamente uma vez;
- `ARCHIVED` é terminal nesta versão.

### 3.2 `public.pricing_policy_versions`

Responsabilidade: versão comercial imutável após publicação.

Campos previstos:
- `id uuid PK`;
- `pricing_policy_id uuid NOT NULL -> pricing_policies(id) RESTRICT`;
- `version_number integer NOT NULL`;
- `revision integer NOT NULL`;
- `schema_version text NOT NULL`;
- `engine_version text NOT NULL`;
- `status text NOT NULL`: `DRAFT | VALIDATING | PUBLISHED | RETIRED`;
- `strategy_type text NOT NULL`;
- `markup numeric NOT NULL`;
- `markup_base text NOT NULL`;
- `notes text NULL`;
- `created_at timestamptz NOT NULL`;
- `created_by uuid NOT NULL -> profiles(id) RESTRICT`;
- `published_at timestamptz NULL`;
- `published_by uuid NULL -> profiles(id) RESTRICT`.

Checks v1:
- `version_number > 0`;
- `revision > 0`;
- `schema_version = '1.0'`;
- `engine_version = '1.0'`;
- `strategy_type = 'MARKUP_ON_COST'`;
- `markup_base = 'TOTAL_COST'`;
- `markup >= 0`;
- metadata de publicação nula em `DRAFT/VALIDATING`;
- metadata de publicação obrigatória em `PUBLISHED/RETIRED`;
- `UNIQUE(pricing_policy_id, version_number)`;
- índice parcial único: uma `PUBLISHED` por `pricing_policy_id`.

Não usar `numeric(p,s)` que provoque arredondamento comercial implícito. Persistir decimal exato e aplicar limites compatíveis com `DecimalString`/gateway do runtime.

Lifecycle:
- `DRAFT -> VALIDATING`;
- `VALIDATING -> DRAFT | PUBLISHED`;
- `PUBLISHED -> RETIRED`;
- `RETIRED` imutável;
- apenas DRAFT é editável;
- entrar em VALIDATING congela a mesma revision;
- publicar a mesma revision validada;
- nenhuma edição de markup durante VALIDATING/PUBLISHED/RETIRED;
- sem DELETE físico.

### 3.3 `public.product_pricing_settings`

Responsabilidade: seleção oficial de policy + mínimo comercial por produto.

Campos previstos:
- `product_id uuid PK -> products(id) RESTRICT`;
- `pricing_policy_id uuid NOT NULL -> pricing_policies(id) RESTRICT`;
- `minimum_selling_price numeric NOT NULL`;
- `revision integer NOT NULL`, inicia em 1;
- `updated_at timestamptz NOT NULL`;
- `updated_by uuid NOT NULL -> profiles(id) RESTRICT`.

Sem tabela separada de assignment na v1. Uma linha resolve as duas configurações atuais do produto.

Invariantes:
- uma linha por produto;
- uma policy pode aparecer em várias linhas;
- mínimo >= 0;
- ausência de linha significa **Pricing não configurado** para o produto;
- não buscar fallback em `materials.min_price`, `price_tiers` ou Home.tsx;
- update exige `expectedRevision` e incrementa exatamente uma vez;
- mudança tem vigência imediata para novos cálculos;
- sem DELETE físico nesta versão.

A versão técnica do produto não participa desta associação. O cálculo ainda registra `productVersionId/number/revision` como proveniência do custo.

### 3.4 `public.pricing_payment_terms`

Responsabilidade: taxas financeiras globais por quantidade de parcelas.

Campos previstos:
- `installments smallint PK`;
- `rate numeric NOT NULL`;
- `revision integer NOT NULL`, inicia em 1;
- `updated_at timestamptz NOT NULL`;
- `updated_by uuid NOT NULL -> profiles(id) RESTRICT`.

Invariantes:
- `installments BETWEEN 1 AND 12`;
- `0 <= rate < 1`;
- para `installments IN (1,2,3)`, `rate = 0`;
- atualização exige `expectedRevision`;
- incremento de revision exatamente uma vez;
- alteração tem vigência imediata;
- sem DELETE físico;
- não armazenar taxa como JSON number no transporte: cast textual decimal.

Bootstrap futuro:
- é permitido criar deterministicamente 1x, 2x e 3x com taxa `0`, pois essa regra foi aprovada;
- **não inventar** taxas para 4x–12x;
- uma condição 4x–12x sem linha configurada deve falhar com erro de configuração, nunca assumir zero.

### 3.5 `public.pricing_audit_events`

Responsabilidade: auditoria durável de mudanças de configuração de Pricing.

Campos conceituais:
- `id uuid PK`;
- `entity_type text NOT NULL`;
- `entity_key text NOT NULL`;
- `action text NOT NULL`;
- `actor_id uuid NOT NULL -> profiles(id) RESTRICT`;
- `occurred_at timestamptz NOT NULL`;
- `before_state jsonb NULL`;
- `after_state jsonb NULL`.

Escopo mínimo:
- policy metadata/status;
- policy draft edits/transitions/publicação;
- associação/minimum de produto;
- taxas globais de parcelamento.

Regras:
- append-only;
- sem UPDATE/DELETE;
- decimais dentro de JSON devem ser strings;
- não expor esse conteúdo a consultor;
- não usar log de aplicação como substituto da auditoria transacional.

## 4. Tabela deliberadamente adiada

### `pricing_policy_charges`

**Não implementar no 16C v1.**

Motivo:
- imposto = não;
- comissão = não;
- taxa administrativa = não;
- taxa financeira de parcelamento é global e ocorre após aplicação do mínimo do produto;
- portanto não pertence à definição persistida da policy v1.

O Pure Pricing Engine continua genericamente capaz de processar charges, mas o mapper persistente v1 deve fornecer `charges: []`.

Se no futuro surgir imposto/comissão/encargo de policy, exigir nova decisão comercial + migration explícita. Não reutilizar `pricing_payment_terms` como child de policy.

## 5. Publicação atômica e concorrência

Publicação deve seguir o padrão robusto de Product Engineering:

1. receber `versionId`, `expectedRevision`, `expectedCurrentPublishedVersionId` e actor autenticado pelo servidor;
2. lock da `pricing_policy`;
3. lock da target version;
4. confirmar target em `VALIDATING`;
5. confirmar revision;
6. validar definição com `validatePricingPublicationReadiness`;
7. confirmar current published com comparação NULL-safe;
8. retirar a versão atual, se houver, para `RETIRED`;
9. publicar a target com `published_at/published_by`;
10. gravar auditoria;
11. commit único.

Duas publicações concorrentes não podem vencer.

Lock ordering canônico:
`pricing_policy -> pricing_policy_version -> configuration row/audit`.

Nunca retirar a versão antiga em request separado da publicação da nova.

## 6. Mapper de persistência

O mapper é estrito e fail-closed.

Ao carregar uma versão:
- `numeric` -> `text`;
- nunca `Number`, `parseFloat`, unary plus ou JSON number financeiro;
- validar `schema_version` e `engine_version`;
- montar `PricingPolicyVersionDefinition`;
- strategy deve sair exatamente como:
  - `type: "MARKUP_ON_COST"`;
  - `markup: <texto decimal>`;
  - `markupBase: "TOTAL_COST"`;
- `charges: []`;
- incompatibilidade oficial -> erro interno sanitizado, sem fallback.

Não aceitar strategy/base enviados livremente pela UI nesta versão.

## 7. Service boundary e autorização

Seguir o padrão ADR-009:

- browser não é autoridade de mutação;
- UI chama endpoint server-side autenticado;
- servidor valida JWT em `auth.getUser`;
- servidor lê `profiles.role`;
- legado `admin` normaliza para `gerente`;
- somente `gerente` pode criar/editar/publicar policy, configurar produto, mínimo e taxa global;
- consultor não possui endpoint de administração;
- official pricing calculation futuro pode ser usado por consultor via endpoint próprio, com DTO público estrito.

### Banco

Para todas as novas tabelas:
- RLS enabled;
- revoke de `PUBLIC` e `anon`;
- não conceder CRUD direto a `authenticated`;
- mutações exclusivamente por RPCs internas invocadas pelo backend/service_role;
- RPC execute revogado de `PUBLIC`, `anon`, `authenticated`;
- grant execute somente a `service_role`;
- `SECURITY DEFINER` somente se demonstradamente necessário; preferir `SECURITY INVOKER` com service_role;
- search_path fixo;
- objetos schema-qualified;
- não conceder `DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN` sem necessidade explícita;
- service_role não é justificativa para remover constraints/triggers: invariantes críticas ficam no banco.

## 8. RPCs/commands previstos

Nomes finais podem ser ajustados na implementação, mas as responsabilidades são fechadas.

### Policy
- create policy + initial DRAFT version;
- update policy metadata/status com expectedRevision;
- create next DRAFT version;
- load policy/version definition;
- save DRAFT markup/notes com expectedRevision;
- transition DRAFT <-> VALIDATING;
- publish VALIDATING atomically;
- archive policy.

### Produto
- set product pricing settings com:
  - productId;
  - pricingPolicyId;
  - minimumSellingPrice textual;
  - expectedRevision nullable somente na criação;
  - actor derivado da sessão.

### Pagamento
- set payment term com:
  - installments;
  - rate textual;
  - expectedRevision nullable somente na criação;
  - actor derivado da sessão.

Nenhum command aceita `actorId` autoritativo do body público.

## 9. Resolução oficial futura

A futura camada `OfficialPricingCalculationService` deve resolver no servidor:

1. produto/versão solicitados e elegíveis;
2. `product_pricing_settings`;
3. policy `ACTIVE`;
4. única policy version `PUBLISHED`;
5. definição persistida -> Pure Pricing Engine;
6. custo via chamada direta a `OfficialCostingCalculationService.calculate`;
7. `P_base` pelo engine;
8. mínimo do produto;
9. condição de pagamento;
10. taxa global ou override gerencial autorizado;
11. ajuste financeiro exato;
12. arredondamento comercial de duas casas (tie-break pendente);
13. DTO público sanitizado.

Browser de consultor pode enviar futuramente:
- produto/versão;
- CalculationRequest técnico permitido;
- quantidade;
- quantidade de parcelas.

Browser de consultor **não** pode enviar:
- custo;
- markup;
- policyId para override;
- policyVersionId;
- minimumSellingPrice;
- financial rate;
- breakdown;
- profit;
- final price.

Gerente poderá, em endpoint/command explícito futuro, informar override de taxa para o orçamento. Isso não altera a taxa global.

## 10. Snapshot futuro de Quotes — fora do 16C

Não criar tabelas de Quote como efeito colateral deste trabalho.

O futuro snapshot precisa ser capaz de registrar:
- productId/versionId/versionNumber/revision;
- costing aggregation version e `effectiveCostAt`;
- total cost privado;
- policyId/versionId/versionNumber/revision;
- markup usado;
- preço-base técnico;
- preço mínimo vigente;
- se o mínimo foi aplicado;
- installments;
- taxa global padrão;
- taxa efetivamente usada;
- origem da taxa: `STANDARD | MANAGER_OVERRIDE`;
- gerente responsável por override de taxa, quando houver;
- preço após taxa;
- regra/versão de arredondamento comercial;
- preço calculado;
- preço negociado;
- desconto/ajuste;
- override abaixo do mínimo;
- justificativa obrigatória quando abaixo do mínimo;
- actor e timestamps relevantes.

Alterar configuração depois não muda snapshot já emitido.

## 11. Falhas fechadas obrigatórias

O cálculo oficial deve falhar, sem fallback, quando:
- produto não possui `product_pricing_settings`;
- policy atribuída não existe;
- policy não está `ACTIVE`;
- não existe exatamente uma versão `PUBLISHED`;
- schema/engine version é incompatível;
- markup persistido é inválido;
- mínimo é inválido;
- parcelas fora de 1..12;
- 4x–12x não possuem taxa global configurada;
- taxa inválida ou >= 1;
- revisão/configuração oficial não pode ser interpretada.

Nunca usar:
- `materials.min_price`;
- `price_tiers`;
- calculadora legada de `Home.tsx`;
- zero implícito para configuração ausente.

## 12. Erros HTTP previstos

Admin/API:
- payload inválido: 400;
- não autenticado: 401;
- não gerente: 403;
- not found: 404 quando apropriado;
- stale revision / concorrência: 409;
- estado/lifecycle incompatível: 409;
- configuração oficial incompatível/corrompida: 500 sanitizado.

Não retornar raw SQL error, markup, taxa privada, custo ou breakdown em erro público de consultor.

## 13. Matriz mínima de testes da implementação

### SQL/invariantes
- status válidos e inválidos;
- code/name/revision;
- FK e RESTRICT;
- sem DELETE físico;
- uma PUBLISHED por policy;
- publication metadata;
- transições válidas/inválidas;
- frozen VALIDATING/PUBLISHED/RETIRED;
- stale revision;
- duas publicações concorrentes;
- rollback atômico;
- markup negativo/formatos incompatíveis;
- uma configuração por produto;
- mesma policy em vários produtos;
- mínimo negativo;
- payment installments 0/13 rejeitados;
- 1x–3x diferente de zero rejeitado;
- taxa <0 ou >=1 rejeitada;
- stale revision em minimum/payment;
- audit append-only.

### Privilégios
Cobrir separadamente:
- anon;
- authenticated consultor;
- authenticated gerente;
- service_role.

Verificar:
- sem table writes diretos pelo browser;
- RPCs internas não executáveis por anon/authenticated;
- nenhuma permissão DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN indevida;
- RLS enabled;
- service boundary preservado.

### TypeScript/mappers
- numeric sempre texto;
- nenhum float financeiro;
- strict schema;
- schema/engine desconhecidos falham;
- policy persistida monta MARKUP_ON_COST/TOTAL_COST;
- `charges: []`;
- ids e revision preservados;
- nenhum legacy source.

### Service
- somente gerente muta configuração;
- admin legado normaliza para gerente;
- consultor não altera markup/mínimo/taxa;
- product sem config falha;
- policy não ACTIVE falha;
- falta de PUBLISHED falha;
- 4x–12x sem taxa falha;
- 1x–3x resolve taxa zero;
- alterações de mínimo/taxa entram em vigor apenas para novos cálculos;
- logs públicos não vazam dados privados.

## 14. Escopo da implementação 16C.2

Branch futura deve nascer do `main` corrente no momento da execução.

Pode incluir:
- contratos de persistência/commands necessários;
- mappers server-side;
- service administrativo server-side;
- migration única/coesa de Pricing Persistence;
- SQL tests isolados;
- TypeScript tests;
- documentação/ADR necessário.

Não incluir:
- UI;
- endpoint de cálculo para consultor;
- Quote persistence;
- desconto;
- override abaixo do mínimo;
- override de taxa por Quote;
- integração Home.tsx;
- migração de dados legacy;
- seeds de markup real;
- seeds de preços mínimos reais;
- taxas reais de 4x–12x;
- alteração em Costing/Engineering;
- aplicação remota no Supabase.

## 15. Proibição de produção

Durante 16C.2:
- não executar `supabase apply_migration`;
- não executar SQL no projeto remoto;
- não executar `db push`, `db reset`, `migration repair`;
- não editar dados reais;
- não realizar deploy manual;
- não mergear sem revisão e autorização.

Testes SQL reais somente em ambiente isolado/local posteriormente preparado. Produção permanece intacta até autorização específica.

## 16. Gates antes de qualquer aplicação futura

Antes de aplicar persistência remotamente:
1. migration revisada integralmente;
2. diff limitado ao escopo;
3. `git diff --check`;
4. npm/build/test green;
5. SQL tests green em ambiente isolado;
6. matriz de privilégios green;
7. concorrência/publicação testadas;
8. rollback documentado;
9. nenhuma configuração comercial real inventada;
10. Preview/CI do SHA final green;
11. autorização explícita para merge;
12. autorização **separada** para aplicação em Supabase.

## 17. Próxima ação após aprovação deste documento

Criar 16C.2 em branch isolada a partir do `main`, implementar somente persistência + service boundary administrativo + testes, sem UI e sem tocar o Supabase remoto.

A única decisão comercial residual fora da persistência é o tie-break do arredondamento de meio centavo, a ser fechada antes da camada de preço comercial final/Quotes.
