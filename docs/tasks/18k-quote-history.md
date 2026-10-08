# 18K — Histórico sanitizado do Quote

Status: **Supabase production aplicado e reconciliado; aguardando CI/Preview e merge**.

## Objetivo

Transformar a trilha append-only já existente em `quote_events` em uma timeline útil dentro do Orçamentista, mantendo a fronteira de privacidade do Quote.

## Eventos públicos

A timeline retorna no máximo os **200 eventos mais recentes** e pode mostrar:
- orçamento criado;
- nova versão salva;
- mudança de status;
- data/hora;
- ator;
- versão do snapshot;
- total final autorizado;
- marcador OFFICIAL ou MANAGER_ADJUSTED.

## Dados que nunca saem do servidor/banco

O histórico não retorna:
- payload bruto de `quote_events`;
- mínimo protegido;
- justificativa gerencial;
- flag de override;
- costing;
- markup;
- taxa financeira;
- private snapshot.

## Autorização

A RPC `quote_history_secure` recebe o ator autenticado resolvido pelo backend e aplica owner-or-manager novamente no banco.

- consultor: apenas seus próprios Quotes;
- gerente: qualquer Quote permitido pelo módulo;
- anon/authenticated/PUBLIC: sem EXECUTE direto;
- service_role: único executor.

A API continua validando sessão, papel e acesso ao módulo Calculadora antes da chamada.

## Compatibilidade

A timeline deriva o modo de preço de cada snapshot:
- legado/null -> OFFICIAL;
- OFFICIAL -> OFFICIAL;
- MANAGER_FINAL_PRICE -> MANAGER_ADJUSTED;
- valor inesperado -> INVALID, rejeitado pelo contrato do servidor.

## SQL production

Migration aplicada:
- `20261008161302_quote_history_18k`.

Arquivo canônico:
- `supabase/migrations/20261008161302_quote_history_18k.sql`.

A função permanece:
- STABLE;
- SECURITY INVOKER;
- `search_path=pg_catalog, public`;
- EXECUTE apenas para `service_role`;
- sem acesso de `anon`, `authenticated` ou `PUBLIC`;
- limite de 200 eventos mais recentes.

## Pós-check production

- Quotes: 0;
- Quote snapshots: 0;
- Quote events: 0;
- smoke como `service_role`: `QUOTE_NOT_FOUND` esperado para Quote inexistente;
- `security_invoker = true`;
- `stable = true`;
- `search_path = pg_catalog, public`;
- `service_role EXECUTE = true`;
- `anon/authenticated/PUBLIC EXECUTE = false`;
- RLS de `quote_events` continua habilitado;
- Security Advisor sem finding nova atribuída à 18K.

## Próximo gate

Criar branch a partir deste head reconciliado, abrir PR draft e validar CI/Preview antes de solicitar merge.
