# 18M — Funil comercial e motivos de perda

Status: **implementação preparada em commit isolado; Supabase ainda não alterado**.

## Objetivo

Transformar o estado atual dos Quotes em um resumo comercial seguro dentro da Central de Orçamentos.

## Escopo

A métrica respeita a mesma visibilidade do Quote:
- gerente: todos os Quotes acessíveis ao módulo;
- consultor: somente Quotes criados por ele.

Nenhum cliente ou detalhe individual entra na resposta.

## Métricas

- total de Quotes;
- DRAFT;
- SENT;
- em aberto = DRAFT + SENT;
- ACCEPTED;
- REJECTED;
- CANCELLED;
- decisões comerciais = ACCEPTED + REJECTED;
- taxa de fechamento = ACCEPTED / decisões comerciais;
- valor total atualmente aceito;
- motivos de perda agregados;
- quantidade de recusas legadas/sem motivo.

Cancelamentos ficam fora da taxa de fechamento porque representam encerramento operacional, não decisão comercial de ganho/perda.

## Motivos de perda

Apenas REJECTED:
- PRICE;
- DEADLINE;
- COMPETITOR;
- NO_RESPONSE;
- CLIENT_CANCELLED;
- OTHER.

A RPC lê somente `reason_code` do evento terminal de recusa. Nunca retorna `reason_note`, payload bruto, cliente, telefone, mínimo, costing ou negociação privada.

## Banco

Nova RPC candidata:
`quote_commercial_metrics_secure(actor,is_manager)`.

Características:
- read-only;
- STABLE;
- SECURITY INVOKER;
- `search_path=pg_catalog, public`;
- EXECUTE apenas por service_role;
- nenhuma tabela nova;
- nenhum backfill.

SQL candidato:
`docs/tasks/18m-quote-commercial-metrics-migration.sql`.

## UI

A Central passa a mostrar:
- Em aberto;
- Taxa de fechamento;
- Aceitos + valor aceito;
- Recusados;
- badges agregados dos motivos de perda.

O resumo é independente da paginação/filtro da tabela e representa todo o universo de Quotes visível ao usuário.

## Próximo gate

Após autorização explícita do Supabase:
1. pré-check production;
2. aplicar RPC read-only;
3. validar ACL e SECURITY INVOKER;
4. smoke transacional/agregado;
5. Security Advisor;
6. reconciliar timestamp remoto;
7. abrir uma única branch/PR e gerar Preview.
