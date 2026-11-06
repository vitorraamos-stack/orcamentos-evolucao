# Etapa 4 — estrutura e instrumentação aplicadas em produção

**Situação em 06/11/2026:** quatro migrations aplicadas diretamente no projeto Supabase de produção `evolucao-orcamentos`. Nenhum projeto, branch ou banco de testes foi criado. O PR #555 continua em rascunho e o frontend ainda não foi publicado.

## Migrations aplicadas

| Migration | Versão registrada no Supabase | Conteúdo | Status |
| --- | --- | --- | --- |
| `dashboard_etapa4_foundation` | `20261106181834` | 9 tabelas, índices, constraints, RLS, privilégios e histórico imutável | Aplicada |
| `dashboard_etapa4_rules_calendar_rpc` | `20261106181837` | Prévia e publicação gerencial de regras, calendário, turnos e exceções | Aplicada |
| `dashboard_etapa4_dependency_rpc` | `20261106181942` | Criação/remoção de dependências, prevenção de ciclos e limpeza auditada | Aplicada |
| `dashboard_etapa4_stage_event_instrumentation` | `20261106192023` | Captura de transições de etapa e pausas por operações bloqueadas | Aplicada |

Os nomes e timestamps dos arquivos `supabase/migrations` foram alinhados com o histórico real do Supabase, para evitar reaplicação acidental em uma futura sincronização.

## Segurança e verificações realizadas

- As nove tabelas novas existem, estão com RLS habilitado e têm políticas explícitas.
- Privilégios confirmados: `anon` sem acesso; `authenticated` somente leitura direta; `service_role` sem acesso direto. Escritas administrativas passam pelas RPCs protegidas por validação de gestor e acesso ao Hub OS.
- Prévia consultiva de regra executada em contexto gerencial; publicação de regra e calendário exercitada em transação revertida; identidade sem perfil gerencial recusada.
- Triggers instalados:
  - `dashboard_stage_interval_order_transition` em `os_orders` (INSERT e atualização dos campos de etapa/arquivamento).
  - `dashboard_stage_pause_operation_status` em `os_order_item_operations` (entrada/saída de BLOCKED, movimentação, exclusão lógica/física).
  - `dashboard_stage_pause_item_change` em `os_order_items` (cancelamento, exclusão lógica/física ou movimentação do item).
- Verificação transacional em uma OS real, com `ROLLBACK`: uma atualização observada na etapa existente gerou marco `unverified`; a mudança para Aprovação fechou esse marco e abriu intervalo `verified`. O rollback restaurou o status original.
- Pós-rollback: `dashboard_stage_intervals` = 0 e `dashboard_stage_pauses` = 0. Nenhum registro de verificação permaneceu.
- Nenhuma regra, jornada, feriado, exceção ou dependência foi publicada automaticamente.

## Limites conhecidos

1. O pgTAP `supabase/tests/dashboard_etapa4_security_contract.sql` não foi executado. Não foi criado ambiente de testes, conforme orientação. Os testes estáticos de SQL fazem parte do CI.
2. A produção não possui operações em `os_order_item_operations`; por isso, o fluxo de pausa de uma operação BLOCKED ainda não foi exercitado com atividade real. Nenhuma fixture foi inserida.
3. OS antigas não recebem histórico retroativo. A primeira atualização observada na mesma etapa cria um marco `unverified`; mudanças posteriores de etapa criam intervalos `verified`.
4. Uma pausa só é registrada quando existe intervalo de etapa aberto. O motivo é copiado do bloqueio registrado; quando não há justificativa válida, o registro informa que ela não foi fornecida.
5. A engine ainda não calcula permanência/gargalos. Para isso, precisará combinar intervalos `verified`, calendário vigente, revisão da regra e pausas completas. Até lá, duração continua indisponível.
6. Não há reserva física de materiais vinculada à agenda. Materiais não devem ser declarados confirmados sem fonte real.

## Estado de publicação

- Banco de produção: **4 migrations aplicadas**; tabelas de regras/calendário/dependências e tabelas de eventos permanecem sem dados operacionais fictícios.
- PR #555: **draft, sem merge**.
- Frontend/Preview/produção Vercel: **inalterados**; produção continua na Etapa 3.
- A UI administrativa e o editor visual de dependências estão apenas na branch de implementação.
