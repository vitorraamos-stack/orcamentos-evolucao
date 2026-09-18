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

`orderRepository` concentra consultas Supabase novas. A Central usa paginação server-side, busca server-side e filtros de etapa server-side. Filtros rápidos são aplicados sobre a página atual nesta fundação; a evolução recomendada é levá-los a uma RPC/query tipada para totais globais. `calculateOrderRisk` é uma função pura e testada, sem persistência ou lógica duplicada na UI.

## Regras iniciais de risco

- **CRÍTICO:** prazo vencido; prazo hoje sem material pronto; instalação até amanhã sem material pronto.
- **ATENÇÃO:** prazo em até dois dias ou nenhuma atualização há quatro dias.
- **NORMAL:** finalizada ou sem condição de alerta.

As regras usam data local operacional e não alteram o banco. Uma fase posterior deve incorporar prazos por etapa e calendário de instalação dedicado.

## Riscos e débito técnico

1. Dois modelos (`os` e `os_orders`) ainda coexistem; escritas legadas devem ser inventariadas antes do cutover.
2. O status é texto livre com vocabulários parcialmente divergentes, sem máquina de transição central.
3. `os_orders` ainda não possui responsáveis por setor nem prioridade canônica; a Fase 1 usa a tag `URGENTE` e sinaliza ausência de responsável.
4. O dashboard lê no máximo as 200 OS ativas mais recentemente atualizadas; para escala, criar RPC agregada protegida por RLS.
5. Filtros rápidos da Central operam sobre a página carregada. Filtros avançados globais requerem expansão segura do repositório/RPC.
6. O antigo `HubOS.tsx` é grande e mistura UI, DnD, áudio, realtime e acesso a dados.
7. Existem arquivos SQL de raiz além da cadeia oficial de migrations, aumentando risco de drift de ambientes.
8. Não há estrutura adequada para responsáveis por etapa, itens, checklists genéricos, comentários e prazos por etapa; devem ser migrations pequenas nas Fases 2/3, nunca tabelas concorrentes de OS.
9. Módulos de instalações, entregas e relatórios aparecem como destinos preparados na navegação, mas permanecem explicitamente fora da Fase 1.

## Estrutura alvo proposta

Evoluir por domínio sem movimentação em massa: `app/routes|layout|permissions`, `modules/dashboard|orders|artwork|production|installations|deliveries|files|reports|settings` e `shared/components|hooks|lib|types`. Repositórios devem encapsular Supabase; componentes recebem modelos operacionais, não builders PostgREST.

## Próximas etapas recomendadas

1. Fase 2: cabeçalho e abas do detalhe; responsáveis tipados; comentários; prazos por etapa; itens após confirmar o modelo necessário.
2. Criar máquina de transições `canTransitionOrderStatus` antes de ampliar mutações.
3. Criar RPC agregada do dashboard e filtros globais da Central, com testes de repositório/RLS.
4. Fase 3: alinhar vocabulário dos boards, checklists configuráveis e aprovação interna.
5. Fase 4: instalações/entregas e mobile, preservando otimização de rota.
6. Fase 5: relatórios e calendário sobre eventos/auditoria, sem introduzir BI ou CRM.

## Migrations da Fase 1

Nenhuma. A implementação usa exclusivamente `os_orders` e seus índices/RLS existentes, evitando alteração prematura de dados.
