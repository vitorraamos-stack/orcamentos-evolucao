# Dashboard operacional — Etapa 4: inteligência avançada

**Base publicada:** Etapas 1–3; decisões 01–44 preservadas. A Etapa 4 permanece isolada na branch `feat/dashboard-inteligencia-avancada-etapa4-20261106` e no PR #555, ainda em rascunho. Nenhum frontend da Etapa 4 foi publicado.

## Entregas implementadas na branch

- Painel **Gargalos e dependências** sob demanda, com consulta RLS das OS acessíveis, itens, operações, responsáveis, prazos, bloqueios registrados e dependências explícitas.
- Motor conservador de exigências por etapa: só aponta ausência quando existe regra persistida, aplicável e válida.
- Configurações → **Regras Operacionais**: edição por escopo, prévia de impacto, justificativa obrigatória, publicação por revisão otimista e histórico auditável.
- Gestão de calendário versionado: jornadas semanais e exceções explícitas, sem horários padrão, feriados ou folgas presumidos.
- Editor visual de dependências por OS, visível a gestores; inclusão e remoção por RPC, com justificativa e auditoria.
- Instrumentação de entrada/saída de etapas e pausas associadas a operações BLOCKED, instalada por migration adicional no banco de produção.

## Regras de evidência

- `BLOCKED` comprova somente um bloqueio registrado, não duração ou gargalo.
- Relações predecessor→sucessor só existem quando um gestor as registra. O banco valida mesma OS, atividades ativas, ausência de duplicidade e ciclos.
- Não há fonte de reserva física de materiais vinculada à agenda; materiais continuam não verificados.
- Aprovação não possui fonte própria de responsável e Logística não possui fonte própria de responsável/prazo. A interface preserva essas limitações.
- Calendários publicados são imutáveis. Uma versão sem data final permanece aberta e impede uma próxima versão até encerramento formal.
- A instrumentação não retroprojeta histórico. OS antigas sem intervalo recebem, na primeira atualização observada, um marco `unverified`; transições efetivamente observadas depois disso são `verified`.
- Pausas só são registradas quando há intervalo de etapa aberto. Não se calcula tempo até que calendário, revisão de regra, intervalo completo e pausas estejam verificados.

## Banco de produção

Quatro migrations aplicadas diretamente ao projeto Supabase existente `evolucao-orcamentos`:
- `20261106181834_dashboard_etapa4_foundation`
- `20261106181837_dashboard_etapa4_rules_calendar_rpc`
- `20261106181942_dashboard_etapa4_dependency_rpc`
- `20261106192023_dashboard_etapa4_stage_event_instrumentation`

A instrumentação foi verificada em uma transação com uma OS real e `ROLLBACK`. O marco `unverified` e a transição `verified` foram observados; após o rollback, as tabelas de intervalos e pausas continuaram com zero linhas. Nenhuma fixture ou dado de teste permaneceu.

O pgTAP não foi executado e não foi criado ambiente separado. O fluxo de pausa não pôde ser exercitado com operações reais porque a produção ainda não possui registros em `os_order_item_operations`.

## Próximas etapas técnicas

1. Validar o CI final com a migration de instrumentação e os testes administrativos.
2. Integrar a leitura dos intervalos/pausas e implementar cálculo de tempo útil apenas quando calendário e evidências forem suficientes.
3. Continuar a validação visual na branch, sem merge nem deploy até autorização explícita.

## Publicação

- PR #555: **draft, sem merge**.
- Frontend da Etapa 4: **não publicado**.
- Vercel de produção: continua na Etapa 3.
