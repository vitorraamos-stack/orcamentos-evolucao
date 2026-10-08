# 18K — Histórico sanitizado do Quote

Status: **implementação preparada em commit isolado; Supabase ainda não alterado**.

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

A nova RPC `quote_history_secure` recebe o ator autenticado resolvido pelo backend e aplica owner-or-manager novamente no banco.

- consultor: apenas seus próprios Quotes;
- gerente: qualquer Quote permitido pelo módulo;
- anon/authenticated: sem EXECUTE direto;
- service_role: único executor.

A API continua validando sessão, papel e acesso ao módulo Calculadora antes da chamada.

## Compatibilidade

A timeline deriva o modo de preço de cada snapshot:
- legado/null -> OFFICIAL;
- OFFICIAL -> OFFICIAL;
- MANAGER_FINAL_PRICE -> MANAGER_ADJUSTED;
- valor inesperado -> INVALID, rejeitado pelo contrato do servidor.

## Banco

Nenhuma alteração foi aplicada ainda.

O SQL candidato está em:
`docs/tasks/18k-quote-history-migration.sql`

Após autorização explícita do Supabase:
1. pré-check production;
2. aplicar a função;
3. validar ACL, SECURITY INVOKER e smoke;
4. executar Security Advisor;
5. reconciliar o timestamp remoto em `supabase/migrations/`;
6. só então criar branch/PR e rodar CI/Preview.
