# EvoluSystem — Etapa 4: contrato de banco, permissões e implantação (PROPOSTA)

> **Somente planejamento / preparação da próxima entrega.** Não é uma migration e não autoriza aplicar SQL, alterar dados, fazer merge nem publicar. Proposta baseada na inspeção somente leitura das definições de colunas, CHECK, índices, funções e RLS existentes no projeto Supabase \`evolucao-orcamentos\`, em 06/11/2026.

## 1. Diagnóstico verificável

- \`os_order_items\` → OS por \`order_id\`, status \`PENDING / IN_PROGRESS / READY / CANCELLED\`, exclusão lógica \`deleted_at\`.
- \`os_order_item_operations\` → atividade por \`item_id\`, status \`PENDING / IN_PROGRESS / COMPLETED / BLOCKED\`, \`assigned_to\`, \`blocked_reason\`, \`deleted_at\`. Sua escrita é controlada por RPC; não alterar o contrato operacional existente para inserir dependências artificialmente.
- \`os_order_assignees\` admite **GENERAL, ART, PRODUCTION, FINISHING, INSTALLATION**. Não existem \`APPROVAL\` nem \`LOGISTICS\` como escopos de responsável.
- \`os_order_deadlines\` admite **ART, APPROVAL, PRODUCTION, FINISHING, INSTALLATION**. Não existe \`LOGISTICS\` como escopo de prazo.
- \`os_orders.logistic_type\` admite **retirada, entrega, instalacao**. As regras condicionais devem considerar os três valores; o protótipo de leitura da Etapa 4 aceita apenas entrega/instalacao e requer compatibilização antes de ativar persistência.
- \`os_orders_event\` guarda eventos; \`os_order_item_operations\` tem datas resumidas, mas **não existem evidências completas de todos os intervalos, pausas e calendário efetivamente vigente**. Logo não é correto calcular tempo parado ou SLA retrospectivo.
- Não há tabelas \`dashboard_operational_rules\` nem \`os_item_operation_dependencies\` no projeto ativo, nem versões de calendário e pausas verificadas para o Dashboard.

### Matriz segura de exigências (fase inicial)

| Etapa | Responsável verificável atualmente | Prazo verificável atualmente | Permitir exigência automática? |
| --- | --- | --- | --- |
| ART | ART ou GENERAL | ART | Sim, após publicação da regra |
| APPROVAL | Sem responsável próprio; GENERAL não prova responsável específico da aprovação | APPROVAL | Prazo sim; responsável não, até mapeamento validado |
| PRODUCTION | PRODUCTION ou GENERAL | PRODUCTION | Sim, após publicação da regra |
| FINISHING | FINISHING ou GENERAL | FINISHING | Sim, após publicação da regra |
| INSTALLATION | INSTALLATION ou GENERAL | INSTALLATION | Sim, após publicação da regra |
| LOGISTICS | Não possui escopo próprio; entregas usam \`assigned_to\` | Não possui prazo próprio; entregas têm \`scheduled_at\` | **Não** até harmonizar regras com entrega/retirada/instalação e permissões |

**Regra de integridade:** não converter falta de mapeamento em \`responsável ausente\` ou \`prazo ausente\`. Bloqueio da publicação de configurações incompatíveis deve ocorrer no backend, não somente na interface.

## 2. Tabelas propostas (nomes alinhados ao leitor já escrito no PR #555)

| Tabela | Papel | Escrita |
| --- | --- | --- |
| \`dashboard_operational_rules\` | Uma linha **publicada e vigente** por escopo: \`id\`, \`scope\`, \`owner\`, \`deadline\`, \`condition_logistic_type\`, \`stalled_limit_minutes\`, \`calendar_verified\` e metadados | Somente RPC de publicação por gestor/admin |
| \`dashboard_operational_rule_revisions\` | Snapshot completo de cada publicação, número de revisão, ator, data, origem e versão anterior | Append-only pelo servidor; sem UPDATE/DELETE |
| \`dashboard_work_calendar_versions\` | Versões imutáveis após publicação: fuso \`America/Sao_Paulo\`, vigência, aprovador e status | Somente publicação auditada |
| \`dashboard_work_calendar_periods\` | Intervalos locais de trabalho por dia da semana; vários turnos permitidos | Somente em revisão de calendário não publicada |
| \`dashboard_work_calendar_exceptions\` | Feriados e exceções confirmados, inclusive turnos substitutos | Somente em revisão de calendário não publicada |
| \`os_item_operation_dependencies\` | Vínculos ativos, direcionais e únicos, dentro da mesma OS: predecessor → sucessora | Somente RPC transacional; sem acesso de escrita direta |
| \`dashboard_operation_dependency_audit\` | Criação e remoção de vínculos, motivo, ator, horário e ID da OS, imutável | Append-only pelo servidor |
| \`dashboard_stage_intervals\` | Intervalos efetivamente registrados da permanência por etapa, com evidência de início/fim e revisão | Via fluxo operacional futuro auditado |
| \`dashboard_stage_pauses\` | Pausas justificadas por etapa/atividade, timestamps e autor de abertura/encerramento | Via fluxo futuro; histórico preservado |

Nenhuma dessas tabelas recebe linhas padrão, limites arbitrários, calendário automaticamente presumido ou dependências retroativas.

## 3. Regras funcionais e segurança

**Regras Operacionais (decisões 15–20, 35–37, 41)**

1. \`scope\` único na tabela de regras *vigentes*; cada mudança gera revisão imutável com payload anterior/novo e actor. Número de versão cresce estritamente na mesma transação.
2. Valores \`owner\` e \`deadline\` em \`required / optional / conditional\`. \`conditional\` exige predicado conhecido e logistic_type compatível (\`retirada / entrega / instalacao\`). Sem predicado verificável, a validação retorna \`insufficient\`, não \`optional\` ou \`missing\`.
3. Exigências proibidas/sem origem confiável: \`APPROVAL.owner\`, \`LOGISTICS.owner\`, \`LOGISTICS.deadline\`, até definição de uma fonte válida, respeitando permissão de instalação/entrega. Nunca inferir de \`GENERAL\` que um aprovador específico foi nomeado.
4. \`stalled_limit_minutes\` pode ser NULL (desabilitado). Valor positivo nunca ativa sozinho uma medição: exige versão de calendário publicada, origem temporal completa, tratamento de pausas e dados sem lacunas. \`calendar_verified\` é preenchido e verificado no **servidor**, jamais pelo formulário como booleano livre.
5. Prévia de impacto (quais OS mudariam de aviso) antes da publicação, revalidação na transação de gravação e auditoria com ator real. Apenas admin/gerente podem publicar; colaboradores com acesso ao Hub podem apenas ler registros permitidos por RLS.

**Calendário e cálculo (decisões 15–20)**

- Calendário versionado com fuso explícito, semana operacional e exceções/feriados informados/confirmados; não assumir jornadas, feriados ou períodos sem cadastro. Alterações criam nova versão e não reescrevem resultados históricos.
- Períodos com início/fim (\`timestamptz\`) e evidência de transição; pausa com motivo e encerramento, sem duração negativa nem intervalos sobrepostos. Não reconstruir histórico incompleto como se fosse auditado.
- Cálculo de tempo útil deve indicar explicitamente \`verified / insufficient\`, versões de calendário e regra utilizadas e limites comparados; sem dados completos, não gerar "gargalo por tempo".
- Recalcular quando mudar evento, calendário efetivo ou regra vigente, sem atualizar o passado; manter referência às versões usadas na avaliação. 
- O status \`BLOCKED\` continua sendo **bloqueio confirmado**; não constitui automaticamente "gargalo de duração".

**Dependências (decisões 43–44)**

- Vínculos distintos, direcionais e sem duplicação; predecessora e sucessora ativas, existentes e pertencentes **à mesma OS**, inclusive quando itens diferentes.
- Validar **ciclo completo** com CTE recursiva e serialização por bloqueio da linha da OS (\`FOR UPDATE\`) na operação de criação, evitando corrida de duas inserções conflitantes.
- A remoção de operação/item (exclusão lógica) precisa invalidar/arquivar vínculos em transação integrada com auditoria. A consulta do Dashboard nunca deve exibir vínculo com atividade desativada como válido.
- Múltiplas predecessoras e ramos paralelos são válidos. \`sort_order\`, setor, tempo e status não criam relação implícita; uma dependência ausente significa *não registrada*, não independência confirmada.
- Operações \`COMPLETED\` e \`BLOCKED\` são avaliadas de forma consistente com alterações concorrentes. O Dashboard consulta e navega, mas **não cria nem edita** vínculos.

**Controle de acesso mínimo**

- Todas as tabelas em \`public\` com \`ENABLE ROW LEVEL SECURITY\` desde a criação; \`REVOKE ALL\` para \`PUBLIC\` e \`anon\`; \`authenticated\` recebe somente o \`SELECT\` necessário, com política \`has_module_access(auth.uid(), 'hub_os')\` e escopo extra por função/módulo quando aplicável.
- Nenhuma política de INSERT/UPDATE/DELETE diretamente exposta para as tabelas de regras, calendário e dependências. Escrita por RPC curta, com \`EXECUTE\` revogado de PUBLIC/anon, concedido a authenticated **e validação server-side de admin/gerente e RLS sem confiar em dados enviados**. Ao utilizar SECURITY DEFINER, usar \`search_path\` fixo e referências qualificadas.
- Auditoria imutável deve registrar quem, quando, o quê, revisão anterior e posterior, motivo e OS, com segurança no servidor. Não criar um endpoint que permita clientes adulterarem eventos.
- Nenhum dado financeiro, pagamento, preço, conciliação ou credencial é consultado por este módulo.

## 4. Dependências que precisam ser concluídas antes da primeira migration

1. Ajustar a validação TypeScript do PR #555 para \`retirada\` e para **não denunciar setores sem fonte válida**.
2. Finalizar a versão SQL transacional com RLS, RPCs de publicação e dependências, validação de ciclos e auditoria. O arquivo de esquema proposto ao lado desta especificação é **um rascunho não executável**, não uma migration.
3. Definir e testar controle de acesso para a futura tela Configurações → Regras Operacionais, prévia de impacto e concorrência entre gestores.
4. Testar em banco de homologação separado: anon, usuário sem Hub, colaborador com Hub, gerente/admin, duas gravações concorrentes, relação cruzada entre OS, atividade excluída, ciclos, horários sobrepostos, calendário incompleto, revogação e auditoria.
5. Solicitar **autorização explícita separada** para criar migration real, aplicar em ambiente de homologação e, depois, aprovar implantação em produção.

## 5. Plano de execução com checkpoints

- **A — projeto de dados (esta entrega):** contrato e SQL de referência versionados em \`docs/tasks/\`, nenhum SQL executado.
- **B — segurança e persistência:** implementar migration + RPCs com índices/constraints, RLS e testes no branch, sem executá-la. Requer autorização de implementação estrutural.
- **C — homologação isolada:** aplicar apenas no banco não produtivo autorizado e testar com fixtures próprias, usuários de testes e concorrência. Requer autorização de aplicação.
- **D — integração/UX:** administrar regras, calendário e vínculos dentro das permissões; conectar leitura existente; testes ponta a ponta e Preview autorizado.
- **E — lançamento gradual:** após aprovações independentes, migrar produção e publicar app de modo compatível, observar alertas/dados. Não criar regras obrigatórias de forma automática.

**Critério de conclusão final da Etapa 4:** não dizer que gargalos temporais, regras configuráveis ou dependências estão "operacionais" enquanto sua fonte de dados, permissões, auditoria e testes não estiverem completos e homologados.
