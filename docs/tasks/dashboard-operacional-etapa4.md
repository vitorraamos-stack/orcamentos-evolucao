# Dashboard operacional — Etapa 4 (inteligência avançada, fase sem migrations)

**Base publicada:** Etapas 1–3; decisões 01–44 preservadas. Decisões desta etapa: 15–20, 35–37, 41, 43–44. Implementação isolada da branch, sem merge, Supabase migrations ou deploy.

## Análise de código e do esquema existente

Inspeção do repositório e das colunas/policies reais do projeto Supabase \`evolucao-orcamentos\` (somente SQL SELECT de metadados):
- Existem \`os_order_items\`, \`os_order_item_operations\`, \`os_order_assignees\`, \`os_order_deadlines\`, \`os_orders_event\` e suas políticas RLS de Hub OS.
- As operações possuem status \`BLOCKED\` e motivo; é possível afirmar **bloqueio operacional registrado**, mas não o tempo de gargalo automaticamente.
- **Não existem** tabela ou contrato persistente para limites por etapa, calendário operacional versionado, exigências obrigatórias/opcionais/condicionais, pausas verificadas ou vínculos predecessor→sucessor entre atividades.
- A existência de \`sort_order\`, \`updated_at\`, atividade no mesmo setor ou duas operações com status pendente **não comprova dependência, tempo parado, caminho crítico ou gargalo**.

## Entrega funcional desta fase

- Painel **Gargalos e dependências** sob demanda, sem prejudicar carregamento dos indicadores, agenda e prioridades.
- Consulta de **todas as OS ativas com acesso via RLS** somente ao abrir o painel; itens, operações, responsáveis e prazos vinculados. Paginação com contagem exata, lotes de IDs, detecção de leituras inconsistentes e erros explícitos. Sem leitura de dados financeiros.
- Contagem por OS distinta de bloqueios comprovados, listagem com busca e filtro, acesso direto à OS; detalhes expansíveis com centro de trabalho e motivo registrado, ou ausência de motivo.
- Motor puro para **exigências por etapa**: distingue \`required\`, \`optional\` e \`conditional\` baseado apenas em regra válida e aplicável. Na ausência da tabela de regras não assinala como infração a falta de responsável ou prazo.
- Motor para **dependências exclusivamente registradas**: suporta múltiplas predecessoras, atividades independentes/paralelas, diferencia predecessora \`BLOCKED\` de mera espera por conclusão, detecta ciclos, autorreferência, vínculos com atividades ausentes/de outra OS e dados inconsistentes. Não reordena, bloqueia ou edita operações.
- Contratos futuros opcionais de leitura \`dashboard_operational_rules\` e \`os_item_operation_dependencies\`. A API diferencia \`42P01/PGRST205\` (tabela inexistente) de erros RLS/network, sem converter indisponibilidade em vazio. Nenhuma dessas tabelas é criada nesta branch.
- Exibe o motivo de tempo/gargalo não mensurável, mesmo que a OS tenha bloqueio registrado; não calcula limites, pausas, dias úteis ou tempos com base em timestamps incompletos.
- Interface responsiva, painel lateral com resumo compacto e detalhes sob demanda; sem ações de escrita, sem alterar ordem/prioridade original do Dashboard.

## Itens ainda dependentes de autorização e infraestrutura (não concluídos)

1. **Decisões 15–20:** limites editáveis, calendário de trabalho/férias/feriados, unidades, horas confiáveis, pausas registradas, histórico auditável e recálculo de gargalos por etapa só podem ser ativados após existir regra operacional persistida e trilha de eventos/pausas confiável. Sem esses dados, não há categoria "possível gargalo" por tempo.
2. **Decisões 35–37, 41:** Configurações → Regras Operacionais requer persistência auditada com aprovação de permissões e prévia de impacto; a engine de requisitos está preparada, mas não há edição, gravação ou interface administrativa fictícia nesta fase. Os rótulos "exigência ausente" aparecem somente com uma regra realmente gravada, validada e visível via RLS.
3. **Decisões 43–44:** a engine/visualização para dependências explícitas está pronta para receber vínculos. Sem uma tabela que os armazene, o painel sinaliza claramente "dependências não disponíveis"; isso **não significa que as operações sejam independentes**.

### Contratos mínimos a decidir antes de migração

- \`dashboard_operational_rules\`: um registro válido por \`scope\` (ART, APPROVAL, PRODUCTION, FINISHING, INSTALLATION, LOGISTICS); campos \`owner\` e \`deadline\` = required/optional/conditional; \`condition_logistic_type\` opcional; \`stalled_limit_minutes\` inteiro positivo/NULL; \`calendar_verified\` bool. Requer calendário auditável separado e versões efetivas.
- \`os_item_operation_dependencies\`: \`id\`, \`order_id\`, \`predecessor_operation_id\`, \`successor_operation_id\`. RLS SELECT somente quem pode consultar Hub OS, restrições transacionais/servidor: atividades da **mesma OS**, ativas e distintas; evitar ciclos, vínculos duplicados e referências excluídas. Nenhuma escrita pelo Dashboard.
- Gestão: mudanças de regras apenas por usuário autorizado e auditadas em histórico imutável; prévia de impacto antes da confirmação; não reescrever registros históricos; remover permissões de INSERT/UPDATE/DELETE para papéis não autorizados.
- Atividades: registrar eventos confiáveis de entrada/saída por etapa e pausas verificadas para cálculo de tempo útil. Sem isso o motor deve recusar calcular duração.

**Estas são propostas de contrato, não migrations aplicadas.** Exigem revisão específica de segurança, política de dados e aprovação antes de implementação. Nenhuma configuração foi presumida como existente.

## Testes e homologação

- \`npm run check\`, \`npm run test\`, \`npm run build:app\`; GitHub CI e workflow de Dashboard.
- Casos cobertos: regra inexistente versus opcional, condicional aplicável, várias predecessoras, paralelismo, espera legítima, predecessor bloqueada, atividades inválidas, ciclo, repetição, RLS, paginação, erro de schema versus permissão e OS sem registros.
- Revisão visual com dados reais requer Preview autorizado em separado. **NÃO fazer merge, aplicar migrations ou publicar** até nova autorização explícita.
