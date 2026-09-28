# Evolução OS 2.0 — auditoria técnica e arquitetura incremental

## Escopo auditado

Auditoria realizada antes das alterações da Fase 1 sobre `README.md`, `package.json`, rotas e autenticação, componentes do Hub OS, repositórios, APIs Vercel, funções Edge, schemas SQL e todas as migrations em `supabase/migrations`. O produto permanece em React 19 + TypeScript + Vite, Tailwind, Supabase Auth/PostgreSQL, R2, Vitest, Radix/Shadcn e `@dnd-kit`.

## Mapa atual

### Dados e modelo canônico

- **`public.os_orders` é a tabela canônica** para regras novas. Ela contém identificação, cliente, título/descrição, prazo, logística, estados de arte/produção, tags operacionais, flags de reprodução/letra-caixa, arquivamento, autoria e timestamps.
- `public.os` é o modelo legado. Continua necessário como adapter de leitura do kiosk e não deve ser apagado até um cutover acompanhado.
- `os_orders_event` registra auditoria; `os_order_assets` e `os_order_asset_jobs` sustentam R2/SMB; `hub_os_order_flow_state`, `os_kiosk_board` e `os_installation_feedbacks` sustentam fluxo/kiosk; `os_finance_installments` é isolada do escopo operacional.
- O frontend usa somente a anon key. Operações privilegiadas estão nas APIs Vercel/Edge Functions; a service role não está no bundle.
- Índices já existem para `art_status`, `prod_status`, `delivery_date`, `created_at`, logística/data, coordenadas, tags e integrações. A Fase 1 não requer migration.

### Estados existentes

Arte: `Caixa de Entrada`, `Em Criação`, `Para Aprovação`, `Ajustes` (aceito pelo tipo/legado) e `Produzir`.

Produção: `Produção`, `Em Acabamento`, `Pronto / Avisar Cliente`, `Logística (Entrega/Transportadora)`, `Instalação Agendada` e `Finalizados`.

Tags de produção: `EM_PRODUCAO`, `PRONTO`, `AGUARDANDO_INSUMOS`, `PRODUCAO_EXTERNA`. Tags de direção de arte: `ARTE_PRONTA_EDICAO`, `CRIACAO_ARTE`, `URGENTE`. Há ainda flags `reproducao`, `letra_caixa`, `archived` e tipos logísticos `retirada`, `entrega`, `instalacao`.

O fluxo solicitado será mapeado progressivamente sobre esses valores, evitando renomear dados existentes. A divergência entre os status declarados em `src/modules/hub-os/statuses.ts` (modelo legado) e `src/features/hubos/constants.ts` é dívida explícita.

### Autenticação e permissões

- Supabase Auth fornece sessão; `profiles.role` contém `consultor_vendas`, `arte_finalista`, `producao`, `instalador` e `gerente` (com aliases legados `consultor`/`admin`).
- `user_module_access` concede módulos; `RequireModule` protege rotas e as RLS usam `has_module_access`/`is_manager`.
- Permissões funcionais atuais são centralizadas por papel em `getHubPermissions`: criação, visualização/movimento dos quadros, auditoria e gestão de usuários.
- A nova navegação só apresenta a área operacional para quem possui `hub_os`; regras mais granulares continuam protegendo Arte e Produção.

### Módulos e integrações reaproveitados

- Quadros de Arte e Produção, DnD, cards, filtros e diálogos existentes permanecem nas rotas `/os/arte` e `/os/producao`.
- Detalhe `/os/:id`, criação `/os/novo`, kiosk `/os/kiosk`, pendências, auditoria e financeiro não foram reescritos.
- Upload/download R2, fila de sincronização SMB, preview de layout e contratos de segurança são preservados.
- Otimização de instalações em `/api/hub-os/optimize-installations` é mantida sem alteração.
- Realtime e mecanismos de recuperação do board continuam no Hub legado, agora acessível em `/hub-os/kanban`.

## Arquitetura da Fase 1

As novas telas são incrementais:

```text
src/modules/dashboard/        dashboard operacional
src/modules/orders/           central, filtros, risco e acesso a dados
src/shared/components/        badges e estados visuais reutilizáveis
src/features/hubos/           implementação existente preservada
src/modules/hub-os/           detalhe, boards, kiosk e compatibilidade
```

`orderRepository` concentra consultas Supabase novas. Desde a Fase 1.1, a Central aplica paginação, busca, etapas e filtros rápidos no servidor, com totais globais. `calculateOrderRisk` é uma função pura e testada, sem persistência ou lógica duplicada na UI.

## Regras iniciais de risco

- **CRÍTICO:** prazo vencido; prazo hoje sem material pronto; instalação até amanhã sem material pronto.
- **ATENÇÃO:** prazo em até dois dias ou nenhuma atualização há quatro dias.
- **NORMAL:** finalizada ou sem condição de alerta.

As regras usam data local operacional e não alteram o banco. Uma fase posterior deve incorporar prazos por etapa e calendário de instalação dedicado.

## Riscos e débito técnico

1. Dois modelos (`os` e `os_orders`) ainda coexistem; escritas legadas devem ser inventariadas antes do cutover.
2. O status é texto livre com vocabulários parcialmente divergentes, sem máquina de transição central.
3. `os_orders` ainda não possui responsáveis por setor nem prioridade canônica; urgência continua representada pela tag `URGENTE`, sem inferir responsabilidade a partir da autoria.
4. O Dashboard agregado depende da migration da Fase 1.1 estar aplicada em cada ambiente.
5. Filtros avançados além do vocabulário atual exigirão expansão segura do repositório/RPC.
6. O antigo `HubOS.tsx` é grande e mistura UI, DnD, áudio, realtime e acesso a dados.
7. Existem arquivos SQL de raiz além da cadeia oficial de migrations, aumentando risco de drift de ambientes.
8. Não há estrutura adequada para responsáveis por etapa, itens, checklists genéricos, comentários e prazos por etapa; devem ser migrations pequenas nas Fases 2/3, nunca tabelas concorrentes de OS.
9. Módulos de instalações, entregas e relatórios aparecem como destinos preparados na navegação, mas permanecem explicitamente fora da Fase 1.

## Estrutura alvo proposta

Evoluir por domínio sem movimentação em massa: `app/routes|layout|permissions`, `modules/dashboard|orders|artwork|production|installations|deliveries|files|reports|settings` e `shared/components|hooks|lib|types`. Repositórios devem encapsular Supabase; componentes recebem modelos operacionais, não builders PostgREST.

## Próximas etapas recomendadas

1. Fase 2: cabeçalho e abas do detalhe; responsáveis tipados; comentários; prazos por etapa; itens após confirmar o modelo necessário.
2. Criar máquina de transições `canTransitionOrderStatus` antes de ampliar mutações.
3. Validar a RPC agregada e os filtros globais da Central com testes de integração RLS em ambiente Supabase efêmero.
4. Fase 3: alinhar vocabulário dos boards, checklists configuráveis e aprovação interna.
5. Fase 4: instalações/entregas e mobile, preservando otimização de rota.
6. Fase 5: relatórios e calendário sobre eventos/auditoria, sem introduzir BI ou CRM.

## Migrations da Fase 1

Nenhuma. A implementação usa exclusivamente `os_orders` e seus índices/RLS existentes, evitando alteração prematura de dados.

# Fase 1.1

## Navegação e modelo canônico

A sidebar agora identifica o produto como **Evolução OS 2.0** e separa visualmente **Operação** (Dashboard, Central, quadros e destinos futuros) de **Outros módulos** (Calculadora, Galeria, Financeiro e Materiais). A renderização continua condicionada às permissões existentes, Configurações permanece isolada ao final e nenhuma rota legada foi removida. Os destinos ainda não entregues exibem explicitamente “Módulo em desenvolvimento”.

`public.os_orders` continua sendo a única tabela canônica desta evolução. A Fase 1.1 não altera registros, políticas RLS, quadros de Arte/Produção nem o adapter legado de `public.os`.

## Filtros globais da Central

`OrderListQuery.quickFilter` traduz cada filtro rápido em cláusulas PostgREST antes de `range`, portanto busca, etapas, filtro rápido, `count` e paginação operam sobre o mesmo conjunto completo. As regras centralizadas são:

- **Em andamento:** `archived = false` e `prod_status` nulo ou sem marcador de finalização;
- **Finalizadas:** `archived = true` ou `prod_status` contendo “finaliz”, mantendo compatibilidade com os dados atuais;
- **Hoje/Amanhã:** igualdade de `delivery_date` com a data operacional brasileira;
- **Esta semana:** intervalo inclusivo entre hoje e os próximos sete dias;
- **Atrasadas:** OS não finalizada, com `delivery_date` anterior a hoje;
- **Urgentes:** `art_direction_tag = URGENTE`;
- **Pendentes:** `production_tag = AGUARDANDO_INSUMOS` ou `art_status = Ajustes`.

`isOrderOverdue` representa atraso independentemente da classificação de risco. Datas compartilhadas usam `America/Sao_Paulo`, evitando derivar o dia operacional por `toISOString()`.

## Dashboard agregado e períodos

A migration `20260919120000_operational_dashboard_metrics.sql` cria `get_operational_dashboard_metrics`. A função é `SECURITY INVOKER`, valida acesso a `hub_os`, lê somente as linhas de `os_orders` visíveis pelas RLS e devolve um único JSON agregado. Assim, as métricas deixam de depender das 200 atualizações mais recentes e não expõem linhas individuais.

O **estoque atual** (ativas, Arte, aprovação, Produção, Acabamento, material pronto, Letra Caixa, Produção Externa e carga de instalação) sempre considera todas as OS atualmente acessíveis e não é reduzido pelo período. Os **eventos do período** (instalações e atrasos) exigem `delivery_date` dentro do intervalo. Prazo hoje e amanhã também exigem data estruturada e são zerados quando essas datas ficam fora do período escolhido. “Esta semana” significa hoje mais sete dias; “Este mês” é o mês-calendário atual; o intervalo personalizado é inclusivo.

Como `os_orders` ainda não tem data de instalação dedicada, instalações do período usam `delivery_date`; essa limitação é apresentada na interface. A seção Atenção usa uma consulta própria, ordenada e limitada a oito OS, em vez de carregar a base para filtrar no navegador. A regra incorreta que tratava `created_by` como responsável foi removida: autoria não representa responsabilidade operacional.

## Limitações restantes

- O vocabulário textual de finalização ainda precisa ser substituído por um estado canônico em evolução futura, sem migração destrutiva.
- Instalações precisam de data própria antes de ganhar planejamento avançado.
- Responsáveis por setor, comentários, itens, checklists e prazos por etapa permanecem deliberadamente fora da Fase 1.1.

# Fase 2 — detalhe operacional da Ordem de Serviço

## Auditoria e decisões

A auditoria confirmou que `public.os_orders` já contém a identificação da venda/OS, cliente, título/descrição, prazo final (`delivery_date`), logística/endereço, estados textuais de Arte e Produção, urgência em `art_direction_tag`, tags/pendências de produção, flags de reprodução e letra-caixa, autoria, arquivamento e timestamps. Esses campos continuam canônicos e não foram copiados para outra tabela. `production_tag = PRODUCAO_EXTERNA` é o marcador canônico disponível para produção externa; a estrutura de fornecedor/previsão continua deliberadamente fora do escopo.

`public.os` e seu detalhe anterior são legados: o componente foi preservado no fluxo `?kiosk=1`, junto com comprovantes, impressão operacional, preview de layout e eventos legados. A navegação normal de `/os/:id`, usada pela Central e pelo Dashboard, agora abre o detalhe de `os_orders`. `os_order_assets` continua sendo a fonte de arquivos R2 e nenhuma chave, bucket, upload, download ou fluxo SMB foi alterado. `os_orders_event` continua sendo a única timeline de auditoria canônica; a Fase 2 apenas amplia sua leitura para usuários com `hub_os` e centraliza novos inserts no repository.

Não foi localizada estrutura canônica existente adequada para responsáveis por etapa, prazos por etapa, linhas operacionais ou comentários internos. O legado possui `os.assigned_to`, mas ele pertence à tabela concorrente antiga e não representa os cinco escopos necessários. Também não há JSON reutilizável de serviços/materiais em `os_orders`; por isso foram criadas quatro relações pequenas, sem preços ou custos.

## Modelo relacional e RLS

- `os_order_assignees`: referência obrigatória a `os_orders` e `profiles`, escopos `GENERAL`, `ART`, `PRODUCTION`, `FINISHING` e `INSTALLATION`, com unicidade por OS/escopo. Há somente um responsável principal por etapa nesta fase.
- `os_order_deadlines`: prazos `ART`, `APPROVAL`, `PRODUCTION`, `FINISHING` e `INSTALLATION`, conclusão opcional e unicidade por OS/escopo. `os_orders.delivery_date` permanece o prazo final e não é duplicado.
- `os_order_items`: serviço operacional, quantidade, medidas opcionais, unidade, notas, status simples, ordenação e `deleted_at`. Não contém valores comerciais. OS antigas permanecem válidas sem itens.
- `os_order_comments`: autor obrigatório em `profiles`, mensagem e exclusão lógica. Não há comentário anônimo, chat, menções, reações ou realtime novo.

Todas as relações usam FK com cascade somente a partir da OS, índices nas consultas operacionais e RLS. A leitura requer `has_module_access(auth.uid(), 'hub_os')`. Responsáveis, prazos e itens só podem ser alterados por `is_manager`; comentários podem ser criados por usuário do Hub e alterados logicamente pelo próprio autor ou gerente. A interface replica essa autorização para UX, mas o banco é a barreira efetiva. Não foi adicionada função `SECURITY DEFINER`.

## Domínio, carregamento e auditoria

`OperationalStage` traduz os vocabulários legados em `ENTRY`, `ART`, `APPROVAL`, `PRODUCTION`, `FINISHING`, `READY`, `LOGISTICS` e `FINISHED`. A máquina central permite o caminho de Arte Caixa de Entrada → Em Criação → Para Aprovação → Produzir, incluindo Para Aprovação → Ajustes e o retorno de Ajustes; Produção segue Produção → Em Acabamento → Pronto/Avisar → Logística/Instalação → Finalizados. Saltos não mapeados e usuários sem permissão do quadro são rejeitados pelas funções puras. Os valores persistidos não foram renomeados.

O risco permanece calculado principalmente pelo prazo final, como na Fase 1.1. Prazos de etapa recebem estado normal, vence hoje, atrasado ou concluído usando o dia operacional `America/Sao_Paulo`; eles não promovem automaticamente uma OS a crítica.

O detalhe inicial busca OS, responsáveis e prazos em paralelo. Itens, comentários, arquivos e histórico são carregados apenas ao abrir a respectiva aba. Consultas usam listas explícitas de colunas e estados de loading, erro e vazio independentes. Mutações chamam repositories validados com Zod; eventos `assignee_changed`, `deadline_changed`, `item_created`, `item_updated`, `item_removed`, `comment_created`, `comment_removed` e `details_updated` são registrados por `recordOrderEvent`, sem inserts espalhados nos componentes. Eventos de status já produzidos pelos quadros/RPCs existentes continuam na mesma timeline e recebem formatação legível.

## Compatibilidade e débitos restantes

A página normal preserva links da Central/Dashboard, dados legados de status, tags, logística, produção externa e assets. Arte, Produção, financeiro, kiosk, R2 e SMB não foram reimplementados. O kiosk mantém o detalhe legado integral para evitar mudança operacional. OS canônicas antigas sem relações Fase 2 exibem empty states e não exigem backfill.

Débitos relevantes: o detalhe legado de `public.os` ainda existe exclusivamente para compatibilidade; nomes amigáveis dos usuários continuam limitados ao e-mail disponível em `profiles`; a edição textual completa de itens pode ganhar um diálogo mais rico; alteração de status permanece nos quadros existentes embora a máquina de domínio já esteja pronta; data/rota/feedback estruturados de instalação ainda pertencem à fase futura; e eventos registrados pelo cliente ainda podem evoluir para uma RPC transacional `SECURITY INVOKER`.

## Migrations da Fase 2

Estas migrations precisam ser aplicadas manualmente no Supabase, na ordem, pois o deploy da aplicação não executa SQL:

1. `20260925100000_os_order_assignees.sql` — responsáveis, helper de timestamp e leitura operacional do histórico.
2. `20260925101000_os_order_deadlines.sql` — prazos por etapa.
3. `20260925102000_os_order_items.sql` — itens operacionais com soft delete.
4. `20260925103000_os_order_comments.sql` — comentários internos com autoria e soft delete.

# Fase 2.1 — fechamento operacional

Itens agora usam um único formulário completo para criação e edição (descrição, quantidade, unidade, medidas, observações e status), validação Zod, confirmação antes do soft delete e auditoria com diferenças dos campos operacionais mais relevantes. Responsáveis aceitam **Sem responsável**, traduzido em `DELETE` — nunca em UUID sentinela. Prazos podem ser concluídos, reabertos e removidos; `completed_at` prevalece sobre atraso e datas de leitura são exibidas em `dd/mm/yyyy`.

A página de detalhe deriva permissões independentes para edição gerencial, responsáveis, prazos, itens, comentários e movimentos de Arte/Produção. A ação **Alterar etapa** lista apenas arestas válidas da máquina e o serviço de transição usa `hub_os_move_order_secure`; mudança e evento `status_change` são, portanto, atômicos. Edições dos campos principais usam `hub_os_update_order_secure` com `details_updated`, também atomicamente. Mutações das quatro tabelas da Fase 2 ainda registram o evento em uma segunda chamada; isso permanece dívida explícita, sem esconder falhas de mutação.

A migration `20260925120000_restrict_get_user_display_names.sql` revoga `PUBLIC`/`anon`, concede apenas a `authenticated` e acrescenta `has_module_access(auth.uid(), 'hub_os')` à leitura de `auth.users`. As demais funções `SECURITY DEFINER` antigas e as políticas permissivas legadas de `profiles` não foram alteradas e devem ser auditadas separadamente. A migration inclui consultas de validação dos grants. Security/Performance Advisors devem ser executados no projeto após a aplicação; findings anteriores devem ser inventariados sem ampliar o escopo desta fase.

Não houve alteração nos boards, kiosk, R2, SMB, `public.os` legado ou no prazo final canônico `os_orders.delivery_date`.

# Fase 2.2 — hardening das mutações da OS

## Banco como autoridade

A máquina TypeScript continua oferecendo feedback imediato e ocultando ações incompatíveis com o papel do usuário, mas não constitui autorização. A migration `20260925130000_harden_hub_os_order_mutations.sql` replica o vocabulário no PostgreSQL; qualquer alteração futura do fluxo deve atualizar conjuntamente `orderTransitions.ts`, os helpers SQL e seus testes. A RPC lê a linha real com `FOR UPDATE`, portanto ignora qualquer `from`, papel ou ator alegado no payload.

Arte permite somente `Caixa de Entrada → Em Criação`, `Em Criação → Para Aprovação`, `Para Aprovação → Ajustes|Produzir` e `Ajustes → Em Criação|Para Aprovação`. Produção permite `Produção → Em Acabamento`, `Em Acabamento → Pronto / Avisar Cliente`, `Pronto / Avisar Cliente → Logística (Entrega/Transportadora)|Instalação Agendada|Finalizados`, `Logística (Entrega/Transportadora) → Instalação Agendada|Finalizados` e `Instalação Agendada → Finalizados`. O handoff `Para Aprovação → Produzir` também inicializa `prod_status = Produção` no servidor.

`arte_finalista` movimenta apenas Arte; `producao`, apenas Produção; `gerente` e o alias legado `admin` movimentam ambos. Todos ainda precisam de sessão e acesso ao módulo `hub_os`. Outros papéis recebem `42501`. OS arquivada ou com produção em `Finalizados` não pode ser movimentada pela ação normal, inclusive por gerente.

## Contratos e atomicidade

`hub_os_move_order_secure` preserva a assinatura da Fase 2.1, aceita exatamente um board (mais o par especial `Produzir`/`Produção`), bloqueia combinações arbitrárias, valida a aresta e grava `status_change`. Campos `board`, `from`, `to` e `actor` são sempre sobrescritos com valores server-side; outros metadados de auditoria podem ser mantidos. Lock, validações, update e evento pertencem à mesma transação PL/pgSQL: qualquer exceção desfaz todos os efeitos.

`hub_os_update_order_secure` agora é exclusivamente gerencial (`gerente`/`admin`). `art_status`, `prod_status`, `archived`, `archived_at` e `archived_by` foram removidos da allowlist; estados passam somente pela RPC de movimento e arquivamento passa por `hub_os_archive_order_secure`, que também exige gerente/admin. Edição e seu evento opcional continuam atômicos.

O grant implícito de funções novas para `PUBLIC` é revogado. `PUBLIC` e `anon` não executam `hub_os_assert_orders_access`, `hub_os_create_order_secure`, `hub_os_update_order_secure`, `hub_os_archive_order_secure`, `hub_os_move_order_secure` nem `hub_os_delete_order_secure`; somente `authenticated` recebe o grant explícito. Os helpers puros da máquina não são expostos nem a `authenticated`. Todas as funções `SECURITY DEFINER` alteradas mantêm `search_path = public` e a autenticação é revalidada por `hub_os_assert_orders_access`.

## Compatibilidade, testes e dívida delimitada

A página operacional já usa `hub_os_move_order_secure` e mantém sua assinatura. A API legada ganhou um adapter para a mesma RPC, sem alterar criação, arquivo, kiosk ou R2. A busca de compatibilidade confirmou que o board legado ainda possui chamadas de status por `updateOrder` e updates diretos/otimistas locais em `HubOS.tsx` e diálogos; elas não são uma autoridade de segurança e as tentativas via update genérico passam a ser rejeitadas. O cutover integral dessas telas para o adapter seguro, incluindo a separação das edições auxiliares de tags/prazos, permanece para a Fase 3 para evitar uma refatoração ampla nesta etapa.

`supabase/tests/hub_os_order_mutations_phase_2_2.sql` cobre as arestas positivas/negativas dos dois boards e grants essenciais. Os testes TypeScript cobrem feedback antecipado, isolamento de papéis, handoff e montagem do contrato RPC. Testes integrados com identidades reais devem ainda validar, no ambiente Supabase, os quatro papéis, status real versus payload falso, bloqueio de finalizada e rollback sem evento.

Os Security e Performance Advisors precisam ser executados novamente depois da aplicação remota da migration. O resultado esperado é a ausência de `anon_security_definer_function_executable` para as seis RPCs acima, especialmente move/update, sem regressão de performance. Findings de outras funções `SECURITY DEFINER` e as RLS permissivas preexistentes de `profiles` permanecem fora do escopo e devem ser inventariados numa auditoria futura.

# Fase 3 — Arte e Produção

## Arquitetura e rotas

Os ambientes operacionais foram separados em `modules/artwork` e `modules/production`, com projeção compartilhada e pequena em `shared/kanban`. `/os/arte`, `/os/arte/aprovacoes` e `/os/arte/revisoes` renderizam o mesmo board de Arte com presets; `/os/producao`, `/impressao`, `/acabamento`, `/letra-caixa`, `/externa` e `/pronto` fazem o equivalente para Produção. `/hub-os/kanban` continua apontando explicitamente para `HubOS.tsx`; erros dos boards novos não acionam fallback automático.

Os repositories fazem uma consulta limitada de OS relevantes e consultas em lote para responsável do escopo, itens, comentários e prazos. Não há consulta por cartão, cópia materializada nem nova tabela. As métricas usam o conjunto completo retornado pelo board antes dos filtros/presets visuais, e não uma página de 25 cartões. O limite defensivo atual é 500 OS operacionais; a Central permanece a fonte do histórico completo. Finalizados antigos não devem evoluir para histórico infinito no Kanban; uma RPC agregada/paginada será indicada se o volume operacional se aproximar desse limite.

## Fluxo, DnD e contratos

As colunas preservam exatamente os textos persistidos. Arte expõe `Ajustes` separadamente. DnD com `@dnd-kit` e o seletor móvel validam a mesma máquina TypeScript antes da chamada, aplicam estado otimista e restauram o snapshot se o banco rejeitar. Movimentos normais usam `hub_os_move_order_secure`. O handoff `Para Aprovação → Produzir` usa exclusivamente `hub_os_send_to_production_secure`; quando falta configuração suficiente, o diálogo coleta o preset/data custom e reutiliza `resolveDeliveryDate`.

Produção mantém **status** (etapa) separado de **tag** (condição). Tags usam `hub_os_set_production_tag_secure`; `AGUARDANDO_INSUMOS` exige material e usa também `hub_os_update_insumos_secure`. O retorno à Arte é menu explícito gerencial via `hub_os_return_order_to_art_secure`, nunca drag reverso.

## Filtros, cards e permissões

Busca cobre OS, venda, cliente e título. Arte oferece Minhas OS, urgentes, atrasadas, responsável e tipo; Produção oferece Minhas OS, atrasadas, responsável, insumos, externa, reprodução e letra-caixa. `Minhas OS` compara o usuário com `os_order_assignees` no escopo correto, nunca com `created_by`. Cards mostram identificação, prazo de etapa preferencial, risco global, responsável, até quatro badges, progresso de itens e comentários; o clique abre `/os/:id`.

`arte_finalista` movimenta somente Arte; `producao`, somente Produção; gerente/admin opera ambos e pode devolver Produção para Arte. Autoatribuição não foi exposta: a RLS da Fase 2 reserva responsáveis a gerente, e o board não a contorna. A edição genérica do diálogo legado agora também fica oculta de papéis operacionais.

## Realtime, migrations e dívida

Um hook pequeno escuta `os_orders`, `os_order_assignees` e `os_order_items`, com debounce. Realtime não é autoridade nem fonte única: há refresh manual, reload após mutação e recovery ao retornar à aba. Esta fase não cria migrations, RPCs de leitura nem afrouxa RLS.

Dívida deliberada: **itens independentes da mesma OS em etapas produtivas diferentes** ainda não possuem máquina própria. O board somente resume `PENDING`, `IN_PROGRESS`, `READY` e `CANCELLED`; essa evolução de modelo deve ser uma fase específica, transacional e não uma extensão improvisada do status da OS.

# Fase 3.1 — Estabilização dos Boards

## Escala, Finalizados e métricas

As OS ativas deixaram de ser uma amostra limitada a 500 registros. O repository compartilhado pagina `os_orders` em faixas inclusivas de 500 até receber uma página parcial. O teto técnico de 10.000 ativas é uma barreira explícita: ao atingi-lo, o carregamento falha com erro em vez de produzir um quadro silenciosamente truncado. Arte carrega `archived = false AND prod_status IS NULL`; Produção carrega ativas com `prod_status IS NOT NULL AND prod_status != 'Finalizados'`.

Finalizados de Produção são consultados separadamente, preservando a coluna sem consumir páginas do fluxo ativo. A janela documentada é de 30 dias por `updated_at`, com no máximo 100 registros, ordenados do mais recente. Busca, filtros e presets continuam locais sobre todo o resultado carregado. O preset **Impressão** preserva a regra `prod_status = Produção AND reproducao = true`.

As quatro relações visíveis no card continuam em consultas em lote. Sua montagem agora cria mapas por `order_id` para responsáveis, itens, comentários e prazos, evitando `find`/`filter` repetidos por OS. As métricas foram extraídas para `boardMetrics.ts` e calculadas antes de filtros e presets, sobre o resultado global do repository. `Atrasadas` usa exclusivamente `isOrderOverdue`; `CRITICO` permanece a classificação de risco de `calculateOrderRisk`. Assim, prazo hoje com material ainda não pronto pode ser crítico sem ser rotulado ou contado como atrasado.

## Sincronização e handoff

A migration `20260925150000_stabilize_operational_boards.sql` adiciona idempotentemente à publication `supabase_realtime`: `os_orders`, `os_order_assignees`, `os_order_items`, `os_order_deadlines` e `os_order_comments`. Nenhuma policy foi criada ou relaxada; Realtime continua sujeito às RLS existentes. O hook assina as cinco tabelas, agrupa rajadas em 350 ms, registra `CHANNEL_ERROR`/`TIMED_OUT`, mantém recuperação por `visibilitychange` e não remove o botão Atualizar.

A mesma migration substitui sem overload ambíguo `hub_os_send_to_production_secure`. O novo contrato recebe e valida `p_delivery_deadline_preset` contra `FAST_5_8`, `STANDARD_8_12`, `STRUCTURE_INSTALL_15_25` e `CUSTOM`; `CUSTOM` exige data. Preset, início, data, ambos os estados, autoria, timestamp e evento são persistidos na mesma transação e sob o mesmo `FOR UPDATE`. A função permanece `SECURITY DEFINER SET search_path = public`, chama o helper de acesso, valida papel/estado e concede execução somente a `authenticated`; `PUBLIC` e `anon` são revogados.

## Separação de responsabilidades

`OperationalBoard.tsx` preserva uma única infraestrutura de DnD e o shell compartilhado, mas deixou de definir métricas e de renderizar os formulários específicos. A coleta de prazo do handoff vive em `modules/artwork/components/ArtworkHandoffDialog.tsx`; tags/insumos vivem em `modules/production/components/ProductionTagDialog.tsx`; os repositories dos módulos selecionam a configuração de seu board. Essa extração é incremental e evita um rewrite do fluxo estabilizado.

## Migration, validação e débitos

A migration precisa ser aplicada pelo pipeline Supabase antes do frontend que envia o novo parâmetro. `supabase/tests/operational_boards_phase_3_1.sql` protege publication e grants; os testes TypeScript cobrem paginação além de 500, teto explícito, semântica crítico/atrasado, contrato do preset e lista de tabelas Realtime. Security e Performance Advisors devem ser executados no projeto remoto depois da aplicação, pois o ambiente local não representa findings do projeto hospedado.

Débitos deliberados: as relações em lote poderão ganhar paginação própria se o limite de URL do PostgREST se tornar relevante em massa extrema; nomes amigáveis ainda dependem do e-mail disponível; e o **fluxo independente por item da OS** permanece evolução futura. Instalações e Entregas não foram implementadas nesta fase.
