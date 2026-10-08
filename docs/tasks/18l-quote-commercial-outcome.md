# 18L — Desfecho comercial do Quote

Status: **implementação preparada em commit isolado; Supabase ainda não alterado**.

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

Nenhuma tabela nova.

A nova RPC `quote_transition_status_v2_secure`:
- mantém optimistic concurrency por `expectedRevision`;
- preserva o trigger existente de lifecycle;
- revalida owner-or-manager dentro do banco;
- grava `reason_code` e `reason_note` somente no payload append-only de `STATUS_CHANGED`;
- é SECURITY INVOKER;
- usa `search_path=pg_catalog, public`;
- será executável apenas por `service_role`.

O runtime novo usa somente v2. A v1 permanece durante a transição de compatibilidade.

## Histórico

`quote_history_secure` continua sem retornar payload bruto e passa a projetar somente:
- `outcome_reason_code`;
- `outcome_reason_note`.

Eventos legados sem motivo continuam válidos com motivo nulo.

## UI

Ao clicar em **Recusado** ou **Cancelar**, o usuário registra o motivo em um diálogo antes da mudança de status.

A timeline mostra o motivo em linguagem comercial.

## Banco

Nenhuma alteração aplicada ainda.

SQL candidato:
`docs/tasks/18l-quote-commercial-outcome-migration.sql`.

Após autorização explícita do Supabase:
1. pré-check production;
2. aplicar transition v2 + projeção do histórico;
3. validar ACL, SECURITY INVOKER e owner/manager;
4. smoke transacional;
5. Security Advisor;
6. reconciliar timestamp remoto;
7. abrir uma única branch/PR e gerar Preview.
