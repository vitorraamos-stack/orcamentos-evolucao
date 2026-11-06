# Dashboard operacional — Etapa 4: inteligência avançada

**Estado em 06/11/2026:** a Etapa 4 está implementada na branch feat/dashboard-inteligencia-avancada-etapa4-20261106 / PR #555. O PR permanece em rascunho. A produção da Vercel continua na Etapa 3.

## Entregas na branch

- Painel de gargalos e dependências com leitura sob demanda, sem inferir sequência entre atividades.
- Regras operacionais por etapa, prévia de impacto, publicação auditada e histórico de revisões.
- Calendários versionados com jornadas semanais e exceções explícitas, sem horários ou feriados presumidos.
- Editor visual de dependências por OS, restrito a gestores, com justificativa para inclusão/remoção e validação de ciclos no banco.
- Captura automática de entrada/saída de etapas e pausas por operações BLOCKED.
- Cálculo de permanência útil em horário de trabalho, descontando pausas verificadas e respeitando o calendário local. Exceder o limite publicado sinaliza permanência acima do parâmetro, não comprova a causa do atraso.

## Evidência e limitações

- Nenhuma regra, jornada, feriado, exceção ou dependência foi criada automaticamente.
- A produção ainda não possui regras/calendários publicados nem intervalos reais de etapa. Portanto, a engine não apresenta duração real neste momento.
- OS antigas não recebem histórico retroativo: a primeira atualização observada dentro da etapa cria um marco unverified; apenas transições observadas depois são verified.
- A medição só é liberada quando regra e calendário correspondem à revisão capturada, a vigência cobre o intervalo, as atividades foram criadas a partir do início da coleta e as pausas estão completas e verificáveis.
- Atividades anteriores à coleta, pausas órfãs ou evidência inconsistente suspendem o cálculo em vez de produzir estimativa.
- Não há integração de reserva física de materiais com a agenda; materiais continuam não verificados.
- A produção não possui operações em os_order_item_operations; por isso, o fluxo de pausa ainda não foi exercitado com atividade real.

## Migrations aplicadas diretamente em produção

Projeto Supabase existente: evolucao-orcamentos. Nenhum ambiente de teste, projeto adicional ou branch de banco foi criado.

1. 20261106181834_dashboard_etapa4_foundation
2. 20261106181837_dashboard_etapa4_rules_calendar_rpc
3. 20261106181942_dashboard_etapa4_dependency_rpc
4. 20261106192023_dashboard_etapa4_stage_event_instrumentation
5. 20261106193315_dashboard_etapa4_operation_pause_trigger_timing_fix

As nove tabelas têm RLS e privilégios diretos verificados. anon não tem acesso, authenticated tem leitura direta e service_role não tem acesso direto; gravações administrativas passam por RPCs com verificação de gestor e Hub OS.

A instrumentação foi exercitada numa transação com uma OS real e ROLLBACK: o marco unverified e a transição verified foram observados; após o rollback, dashboard_stage_intervals e dashboard_stage_pauses permaneceram com zero linhas.

## Validação e publicação

- CI inclui npm run check, testes unitários e build.
- Os testes estáticos verificam contratos das migrations e a correção do momento dos triggers.
- O pgTAP supabase/tests/dashboard_etapa4_security_contract.sql não foi executado; nenhum ambiente de teste foi criado.
- Não foram inseridas fixtures ou OS fictícias em produção.
- PR #555: draft, sem merge.
- Frontend da Etapa 4: não publicado.
- Vercel de produção: Etapa 3.
