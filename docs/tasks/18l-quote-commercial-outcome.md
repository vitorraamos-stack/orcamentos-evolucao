# 18L — Desfecho comercial do Quote

Status: **Supabase production aplicado e reconciliado; aguardando CI/Preview e merge**.

## Objetivo

Completar o ciclo comercial do Quote com motivo estruturado para perdas e cancelamentos, preservando o histórico append-only já existente.

As datas de envio, reabertura, aceite, rejeição e cancelamento continuam sendo derivadas de `quote_events.occurred_at`, evitando colunas duplicadas que poderiam divergir da trilha de auditoria.

## Regras

### REJECTED
Motivo obrigatório:
- PRICE;
- DEADLINE;
- COMPETITOR;
- NO_RESPONSE;
- CLIENT_CANCELLED;
- OTHER.

### CANCELLED
Motivo obrigatório:
- DUPLICATE;
- CREATED_BY_MISTAKE;
- SCOPE_CHANGED;
- OTHER.

`OTHER` exige observação com pelo menos 5 caracteres.

A observação é opcional para os demais motivos e limitada a 300 caracteres.

Transições para DRAFT, SENT e ACCEPTED não aceitam motivo comercial.

## Persistência

Nenhuma tabela nova e nenhum backfill.

A RPC `quote_transition_status_v2_secure`:
- mantém optimistic concurrency por `expectedRevision`;
- preserva o trigger existente de lifecycle;
- revalida owner-or-manager dentro do banco usando o ator e o contexto de gerente fornecidos pelo backend autenticado;
- grava `reason_code` e `reason_note` somente no payload append-only de `STATUS_CHANGED`;
- é SECURITY INVOKER;
- usa `search_path=pg_catalog, public`;
- é executável apenas por `service_role`.

O runtime 18L usa somente v2. A v1 permanece disponível durante o rollout de compatibilidade.

## Histórico

`quote_history_secure` continua sem retornar payload bruto e projeta somente:
- `outcome_reason_code`;
- `outcome_reason_note`.

Eventos legados sem motivo continuam válidos com motivo nulo.

## UI

Ao clicar em **Recusado** ou **Cancelar**, o usuário registra o motivo em um diálogo antes da mudança de status.

A timeline mostra o motivo em linguagem comercial.

## SQL production

Migration aplicada:
- `20261008165833_quote_commercial_outcome_18l`.

Arquivo canônico:
- `supabase/migrations/20261008165833_quote_commercial_outcome_18l.sql`.

## Pós-check production

- Quotes: 0;
- Quote snapshots: 0;
- Quote events: 0;
- `quote_transition_status_v2_secure`: SECURITY INVOKER;
- `quote_history_secure`: STABLE + SECURITY INVOKER;
- `search_path=pg_catalog, public` nas duas funções;
- `service_role EXECUTE=true`;
- `anon/authenticated/PUBLIC EXECUTE=false`;
- RLS de `quote_events` continua habilitado;
- RPC v1 permanece disponível durante o rollout;
- smoke transacional validou owner, bloqueio de não-dono, motivo obrigatório, rejeição PRICE, cancelamento DUPLICATE por gerente e projeção sanitizada no histórico;
- smoke terminou em ROLLBACK, mantendo 0 Quotes/snapshots/events;
- Security Advisor sem finding nova atribuída à 18L.

## Próximo gate

Criar branch a partir deste head reconciliado, abrir PR draft e validar CI/Preview antes de solicitar merge.
