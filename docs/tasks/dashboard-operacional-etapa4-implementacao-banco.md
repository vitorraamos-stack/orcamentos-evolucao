# Etapa 4 — banco, eventos e medição temporal

**Projeto:** Supabase de produção evolucao-orcamentos.
**Política de execução:** migrations aplicadas diretamente no projeto existente, conforme autorização do usuário. Nenhum projeto, branch ou ambiente de teste foi criado.

## Histórico de migrations

| Migration | Versão | Resultado |
| --- | --- | --- |
| dashboard_etapa4_foundation | 20261106181834 | 9 tabelas, índices, constraints, RLS e histórico imutável |
| dashboard_etapa4_rules_calendar_rpc | 20261106181837 | Prévia/publicação de regras, calendário, jornadas e exceções |
| dashboard_etapa4_dependency_rpc | 20261106181942 | Dependências, prevenção de ciclos e limpeza auditada |
| dashboard_etapa4_stage_event_instrumentation | 20261106192023 | Transições de etapa e pausas BLOCKED |
| dashboard_etapa4_operation_pause_trigger_timing_fix | 20261106193315 | INSERT/UPDATE AFTER e DELETE BEFORE para respeitar a FK da operação |

## Segurança verificada

- Nove tabelas com RLS habilitado e políticas explícitas.
- Privilégios diretos: anon sem acesso; authenticated somente leitura; service_role sem acesso direto.
- RPCs administrativas verificam usuário, perfil de gestor e acesso ao Hub OS.
- Funções internas de trigger/helper não têm execução direta concedida aos papéis de API.
- Histórico de publicação e auditoria de dependências é protegido contra alteração/exclusão direta.

## Triggers instalados

- dashboard_stage_interval_order_transition em os_orders: AFTER INSERT/UPDATE de etapa e arquivamento.
- dashboard_stage_pause_operation_status em os_order_item_operations: AFTER INSERT/UPDATE, para que a linha da operação já exista antes de gravar operation_id.
- dashboard_stage_pause_operation_delete em os_order_item_operations: BEFORE DELETE, para encerrar a pausa antes da ação FK ON DELETE SET NULL.
- dashboard_stage_pause_item_change em os_order_items: BEFORE cancelamento, exclusão lógica/física ou movimentação.

## Sem retroprojeção

- OS novas registram o primeiro intervalo no instante de criação quando o escopo é reconhecido.
- OS antigas não recebem data de entrada inventada. A primeira atualização observada na mesma etapa cria marco unverified.
- Transições de etapa efetivamente observadas abrem intervalos verified.
- Pausas BLOCKED são registradas somente quando existe intervalo de etapa aberto. Bloqueios anteriores à coleta não recebem duração presumida.
- Nenhuma regra, jornada, exceção ou dependência foi criada automaticamente.

## Verificação transacional em produção

Foi usada uma OS existente dentro de uma transação revertida:
1. Uma atualização observada na etapa atual abriu marco unverified.
2. A mudança para Aprovação encerrou esse marco e abriu intervalo verified.
3. ROLLBACK restaurou o status original e removeu os registros temporários.

Após o rollback, dashboard_stage_intervals e dashboard_stage_pauses permaneceram com zero linhas. Nenhuma OS, venda ou dado financeiro foi alterado de forma persistente.

A instalação dos triggers de pausa foi conferida em information_schema.triggers. A produção não possui registros em os_order_item_operations, então o fluxo real de pausa não pôde ser exercitado sem inserir fixtures — o que foi evitado.

## Engine de permanência útil na branch

O cálculo cruza intervalo verificado, revisão da regra, calendário versionado, jornada semanal, exceções e pausas. O cálculo só é liberado quando:
- a regra não foi alterada depois da entrada na etapa;
- o calendário vinculado cobre todo o intervalo;
- as operações foram criadas após o início da coleta;
- as pausas estão completas, verificadas e associadas a operações ainda consultáveis.

Pausas sobrepostas são unidas antes de descontar o tempo útil. Exceções substituem a jornada semanal na data correspondente. Se houver lacuna ou inconsistência, a medição é suspensa. O limite excedido é apresentado como permanência acima do parâmetro, não como causa comprovada de gargalo.

A engine possui testes unitários para fuso, exceções, pausas sobrepostas, revisão alterada, marco não verificado e histórico incompleto. Como não há regras/calendários/intervalos reais em produção, nenhuma duração real está sendo exibida.

## Testes não executados em produção

O pgTAP supabase/tests/dashboard_etapa4_security_contract.sql não foi executado. O CI valida TypeScript, testes unitários, build e contratos estáticos de migration; não executa pgTAP nem testes concorrentes contra produção. Não foram criados ambientes adicionais nem fixtures em produção.

## Publicação

- PR #555: draft, sem merge.
- Frontend da Etapa 4: não publicado.
- Vercel de produção: continua na Etapa 3.
- Banco de produção: cinco migrations aplicadas; nenhuma configuração operacional foi presumida.
