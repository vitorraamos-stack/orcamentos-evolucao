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
