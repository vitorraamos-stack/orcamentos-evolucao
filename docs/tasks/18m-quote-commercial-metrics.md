# 18M — Funil comercial e motivos de perda

Status: **Supabase production aplicado e reconciliado; aguardando CI/Preview e merge**.

## Objetivo

Transformar o estado atual dos Quotes em um resumo comercial seguro dentro da Central de Orçamentos.

## Escopo de visibilidade

- gerente: consolidação de todos os Quotes acessíveis ao módulo;
- consultor: somente Quotes criados por ele.

Nenhum cliente, telefone ou detalhe individual entra na resposta agregada.

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

Cancelamentos ficam fora da taxa de fechamento porque representam encerramento operacional, não uma decisão comercial de ganho/perda.

## Motivos de perda

Somente REJECTED:
- PRICE;
- DEADLINE;
- COMPETITOR;
- NO_RESPONSE;
- CLIENT_CANCELLED;
- OTHER.

A RPC lê apenas `reason_code` do evento terminal de recusa. Nunca retorna:
- `reason_note`;
- payload bruto;
- cliente;
- telefone;
- mínimo protegido;
- costing;
- markup;
- negociação privada.

## Banco

Migration aplicada:
- `20261008172217_quote_commercial_metrics_18m`.

Arquivo canônico:
- `supabase/migrations/20261008172217_quote_commercial_metrics_18m.sql`.

A função `quote_commercial_metrics_secure(uuid,boolean)` é:
- read-only;
- STABLE;
- SECURITY INVOKER;
- `search_path=pg_catalog, public`;
- executável apenas por `service_role`;
- sem tabela nova;
- sem backfill.

## Pós-check production

- Quotes: 0;
- Quote snapshots: 0;
- Quote events: 0;
- `security_invoker = true`;
- `stable = true`;
- `search_path=pg_catalog, public`;
- `service_role EXECUTE=true`;
- `anon/authenticated/PUBLIC EXECUTE=false`;
- RLS de `quotes` e `quote_events` continua habilitado;
- Security Advisor sem finding nova atribuída à 18M;
- nenhuma projeção de `reason_note`, `customer_name` ou `customer_phone`;
- conversão confirmada como ACCEPTED / (ACCEPTED + REJECTED), excluindo CANCELLED.

## Smoke transacional

Validado com dados temporários e lifecycle real:
- consultor: 5 Quotes próprios;
- gerente: 7 Quotes da equipe;
- DRAFT/SENT/ACCEPTED/REJECTED/CANCELLED;
- conversão de 50%;
- valor aceito de R$ 1.000,00 para o consultor;
- valor aceito de R$ 1.500,00 no consolidado;
- motivos PRICE e DEADLINE agregados;
- notas dos motivos não vazaram;
- primeiro teste tentou inserir estados terminais diretamente e foi corretamente bloqueado por `quote_guard_quote()`;
- smoke final respeitou o lifecycle oficial e terminou em ROLLBACK;
- contagens production retornaram a zero.

## UI

A Central passa a mostrar:
- Em aberto;
- Taxa de fechamento;
- Aceitos + valor aceito;
- Recusados;
- badges agregados dos motivos de perda.

O resumo é independente da paginação/filtro da tabela e representa todo o universo de Quotes visível ao usuário.

## Próximo gate

Criar branch a partir deste head reconciliado, abrir PR draft e validar CI/Preview antes de solicitar merge.
