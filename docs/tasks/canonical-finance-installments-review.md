# EvoluSystem — proteger as parcelas do Financeiro canônico

**Estado:** candidato para revisão, **não aplicado**. Nenhum build/deploy necessário para este trabalho.

## Diagnóstico confirmado em 19/10/2026 (somente leitura)

1. Existem 0 linhas nas tabelas financeiras legadas (`os`, `os_event`,
   `os_payment_proof`) e **1 OS canônica** em `os_orders`.
   A tabela canônica `os_finance_installments` também está vazia,
   mas é a superfície do Financeiro atual.
2. O caminho comum `/os/:id` carrega `OrderDetailPage`
   (canônico). A rota com `?kiosk=1` continua tendo um detalhe
   legado como fallback; o cadastro novo `/os/novo` usa
   `CreateOrderForm` canônico.
3. As páginas `/financeiro` e `/hub-os/financeiro` usam
   `FinanceiroPortalPage` + `src/features/hubos/finance.ts`,
   que acessam `os_finance_installments`.
4. No PostgreSQL, `anon` e `authenticated` receberam
   `SELECT/INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES/MAINTAIN`
   na tabela canônica. A RLS impede a maioria das leituras anônimas,
   mas **`authenticated` com `hub_os_financeiro` pode atualizar
   qualquer uma das 12 colunas** e um usuário `hub_os` pode inserir
   diretamente uma parcela conforme RLS.
5. As páginas de conciliação atualizam somente `status`, `notes`,
   `reviewed_at` e `reviewed_by` por meio de
   `updateFinanceInstallment`; cadastro de comprovante chama a RPC
   `finance_upsert_from_asset`, com `SECURITY DEFINER` owned by
   `postgres`, que valida criador, OS e metadados do arquivo R2.
6. O gatilho atual registra mudanças de `status` e `notes`
   mas **não valida alterações nas demais colunas estruturais**.

## Objetivo do candidato

Retirar todos os grants diretos de `anon`, restringir
`authenticated` a SELECT + UPDATE somente das quatro colunas
do formulário de conciliação, e manter inalterados os grants
de `service_role`, owner `postgres`, RPC de cadastro,
tabelas, índices, triggers e policies.

Esse desenho permite preservar o BPO Financeiro e o fluxo de
comprovantes sem conceder alteração client-side de `os_id`,
`installment_no`, `total_installments`, `asset_id`,
`created_at` ou `created_by`.

## Portões ainda abertos (não homologados)

- Confirmar integrações externas desconhecidas que façam INSERT/
  DELETE ou UPDATE estrutural da tabela com JWT `authenticated`.
  A busca estática do repositório não prova sua ausência fora dele.
- Validar com autenticação real que o upload legítimo continue
  chamando `finance_upsert_from_asset`, e que mudanças de status
  e observação na interface BPO sejam preservadas.
- Examinar fluxos de exclusão/arquivamento de OS e cascata.
- O campo `reviewed_by` continuaria editável pelo BPO;
  uma etapa posterior deve validá-lo no servidor (`auth.uid()`)
  para garantir autoria, caso a regra do negócio exija auditoria
  não falsificável.
- Confirmar que a RPC de cadastro não tem novos riscos de
  re-submissão de comprovantes já reconciliados; esse assunto
  exige análise separada.
- Validar sem dados fictícios nem transações reais forçadas.
- Solicitar **nova autorização explícita** antes de aplicar SQL
  ou integrar no `supabase/migrations`.

## Relação com a 19V-C2 legada

A migração 19V-C2 protege as tabelas `os`, `os_event` e
`os_payment_proof`. Ela não endurece
`os_finance_installments` ou a conciliação financeira atual.
Deixar a 19V-C2 separada e **não aplicar** nesta etapa.

## Rollback proposto (somente estratégia)

Preferir GRANT pontual à função ou usuário de integração que
necessitar de um campo adicional, sem restaurar UPDATE amplo.
Se houver falha comprovada após rollout autorizado, a reversão
deve ser uma migração aprovada e focada. Reabrir INSERT e UPDATE
gerais para todo `authenticated` eleva risco de fraude de dados.
Não apagar comprovantes ou reescrever histórico financeiro.
