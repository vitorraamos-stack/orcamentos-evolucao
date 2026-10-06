# Relatório do trabalho noturno — Orçamentista Inteligente

Sessão iniciada em 05/10/2026, horário de São Paulo. Evidências coletadas nesta sessão, sem execução agendada de desenvolvimento. Repository: vitorraamos-stack/orcamentos-evolucao.

## 1. Estado do PR 16A

[PR #418 — feat: add pricing domain contracts](https://github.com/vitorraamos-stack/orcamentos-evolucao/pull/418).
Branch: feat/pricing-domain-contracts. Head revisada: `5354a90b409845f3e52889a0be4af5225d82d8ed`.
Base main: `1f2172a6710aab00abe49e355b731ca6b564485a`.
Conclusão: tecnicamente aprovado no escopo puro de contratos; aberto, sem merge. Aprovação técnica foi registrada como COMMENT, não como aprovação formal de branch protection. Review ID: 5422199490.

Diff completo: 6 arquivos adicionados, 510 linhas, somente shared/pricing. Nenhum arquivo preexistente, dependency, lockfile, API, UI ou migration alterado.

| Item revisado | Resultado |
|---|---|
| Zod-first | schemas strict; tipos inferidos; validação runtime; nenhuma coerção financeira |
| Versionamento | schema 1.0 independente; versionNumber diferente de revision |
| Lifecycle | 4 transições admitidas; 16 combinações testadas |
| Editabilidade | somente DRAFT; VALIDATING congelado; PUBLISHED/RETIRED não editáveis |
| Metadata | publicação pareada; exigida PUBLISHED/RETIRED; proibida DRAFT/VALIDATING |
| DecimalString | primitivo existente; lexical plain decimal; limites gateway tratados |
| PricingRate | decimal.js no range 0<=r<1; aceita texto e preserva representação; rejeita number |
| PercentageBase | TOTAL_COST/SELLING_PRICE; sem base implícita |
| ChargeKind | TAX/COMMISSION/FINANCIAL_FEE/OTHER; vocabulário fechado |
| StrategyType | GROSS_UP/MARKUP_ON_COST; sem implementação/default comercial |
| Erros | seis códigos de domínio; safeParse mapeado; guards retornam erros previstos para estados válidos |
| Segurança | módulo puro sem I/O/segredos; não amplia acesso nem transmite custos |
| Scope/Supabase | nenhuma alteração de banco, API, UI, fórmulas, legacy ou regra comercial |

Os guards de lifecycle são precondições, não controles de autorização ou transações. Unicidade de versão publicada, foreign key real e revision concorrente são responsabilidades futuras de persistence. Importar os primitives de code/timestamp de Product Engineering não importa regra financeira.

## 2–4. Problemas, correções e SHAs

Nenhum defeito bloqueante encontrado em 16A; nenhum commit corretivo necessário e nenhuma mudança na sua head. As três falhas de preflight descritas pelo autor não se reproduziram. Não modificar testes/infra para esconder falhas que não ocorreram.

Dois riscos de implementação futura documentados: PricingRate não representa markup >=100%; precisão decimal computacional de 50 dígitos pode perder denominadores muito próximos de zero. 16B propõe markup próprio e racional exato interno com serialização técnica explícita.

Os documentos 16B e 16C são proposta, não implementação do engine/persistence. A branch documental é criada diretamente de origin/main e não contém contratos ou runtime. SHA/PR documental são registrados no fechamento da sessão.

## 5. Testes

| Verificação | Resultado |
|---|---|
| npm ci | passou; package/lockfile sem mudança |
| npm run check | passou, como etapa do build |
| npm run test | 118 arquivos / 838 testes passaram |
| Pricing isolado dentro da suíte | 79 testes passaram |
| Preflight subprocess tests | 4 testes passaram, inclusive os 3 anteriormente falhos |
| check:dialog-imports | passou |
| Vite bundle via npm run build | passou |
| git diff --check | passou |
| GitHub CI #605 | completed/success; Node 22 conforme workflow |

Ambiente local: Node 24.19.0, npm 11.9.0; engines pede Node 22 e npm >=10 <12. O mismatch local gerou warning, não falha. Não atribuir execução local a Node 22. CI em Node 22 confirma o runtime exigido. Aviso preexistente de bundle >500 kB não foi tratado como problema de Pricing e não provocou alteração de UI/build.

## 6. Vercel Preview

[Preview da branch](https://orcamentos-evolucao-git-feat-pricin-2bc96a-vitor-ramos-projects.vercel.app).
[Deployment inspecionado](https://vercel.com/vitor-ramos-projects/orcamentos-evolucao/HSaBJFN3tbpW2ZSSEnHc3WyzNqLb).
ID: dpl_HSaBJFN3tbpW2ZSSEnHc3WyzNqLb. State/readyState READY; source git; target null (Preview); git SHA corresponde exatamente à head de 16A. Build logs confirmam Build Completed e Deployment completed. GitHub commit status Vercel success.

Nenhum deploy manual; nenhum acesso à aplicação para gerar cálculo ou modificar dados. Esta verificação confirma deployment/build, não uma avaliação de UX: 16A não introduz tela ou endpoint. PR documental pode acionar Preview automático por integração Git, sem promover produção.

## 7. Supabase

Nenhuma ferramenta Supabase, comando de database, SQL remoto ou chamada de leitura a produção foi executada. Testes usam mocks; runtime preflight da suíte usa ambiente sem credenciais. Nenhuma migration criada/alterada/aplicada; supabase/ ausente do diff. Afirmação de integridade significa ausência de ações desta sessão, não auditoria comparativa de dados ou de mudanças feitas por terceiros.

## 8–9. Arquitetura 16B e matriz de Pricing

Documento completo: [prompt-16b-pricing-engine.md](prompt-16b-pricing-engine.md).
Motor puro Zod-first, estratégia discriminada, charges de base explícita, consumo de totalCost já expandido, metadados de proveniência e publicação, matemática racional exata interna, serialização computacional versionada, sem regra de arredondamento comercial. Integração futura chama OfficialCostingCalculationService diretamente no servidor, projeta custo mínimo necessário e aplica DTO allowlist para consultor.

Fórmulas genéricas: GROSS_UP `P=C(1+a)/(1-b-m)`; MARKUP `P=(C(1+a)+kX)/(1-b)`, com X explicitamente C ou C(1+a). Denominador >0; markup não é margem; q não expande C novamente. Valores da empresa não escolhidos.

Matriz completa inclui 15 fixtures matemáticas, validação/limites, 0/100%/soma>=100%, denominador extremo, lucro, ordem, homogeneidade, periodicidade, imutabilidade, provenance e não vazamento. Fixtures são neutras TEST_ONLY. Segurança real de endpoint/persistência é teste de etapa futura, não uma funcionalidade introduzida em 16B.

## 10. Perguntas para Vitor/Marcos

| Decisão | Pergunta necessária | Parte parada |
|---|---|---|
| Estratégia e base | Cada família/produto usa margem sobre venda ou markup? No markup, a base inclui encargos sobre custo? | configuração oficial |
| Valores de margem/markup | Quais valores aprovados e por quais famílias/cenários? | policy real |
| Impostos | Quais encargos e alíquotas devem compor cada cenário e sobre qual base? | policy fiscal real |
| Comissão | Quais percentuais, bases e condições aprovadas? | policy de comissão |
| Financeiro | Quais taxas por pagamento/parcela, bases e encargos fixos reais? | payment scenario |
| Preço mínimo | Existe mínimo por item, produto ou orçamento? Qual valor e precedência? | preço final |
| Desconto | Há teto, aprovação, base e efeito sobre margem/comissão? | negociação |
| Arredondamento | Como e quando arredondar total/unitário; casas, múltiplos e modo? | preço final comercial |
| Abrangência | Policy global, por produto/família ou cenário? Como selecionar sem ambiguidade? | resolução/persistência da vinculação |

Encargos fixos, taxas não lineares, impostos em cascata e preço unitário comercial arredondado não estão na fórmula genérica de percentuais. Se forem necessários, exigir contrato/versionamento específicos após resposta; não representar taxa fixa como percentual artificial. Sem respostas, motor técnico pode avançar, mas não calcular/aplicar preço comercial oficial.

## 11. Arquitetura 16C

Documento completo: [prompt-16c-pricing-persistence-architecture.md](prompt-16c-pricing-persistence-architecture.md).
Aggregate policies/versions/charges, numeric transportado como texto, lifecycle/locks/revision, publicação validada e imutável, RLS/grants mínimos, serviço server-side, RPCs conceituais sem SQL executável. Vinculação comercial e snapshots de Quotes aguardam definição; não criar migration nesta sessão.

## 12. Próxima ação recomendada

Vitor pode revisar 16A e autorizar seu merge em uma ação separada. Enquanto isso, 16B pode ser implementado como PR empilhado de motor puro conforme o prompt, sem ativar preços reais e sem persistência. Este trabalho noturno foi autorizado para projetar 16B, portanto não implementa o engine nesta sessão. Recolher decisões comerciais antes da integração oficial; preparar 16C somente após estabilizar 16B e exigir autorização específica antes de qualquer aplicação em produção.

main modificada durante trabalho autônomo = NÃO

Supabase produção modificado = NÃO

migration aplicada = NÃO

regra comercial inventada = NÃO
