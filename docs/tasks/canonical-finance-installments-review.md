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

## Análise de dependências — 19/10/2026 (nova revisão)

**Conclusão: o candidato de ACL NÃO está liberado para aplicar.**
Dois bloqueios de integridade financeira permanecem no banco, e o
preflight SQL desta proposta foi atualizado para **falhar
deliberadamente** enquanto não forem corrigidos.

### Risco A — ressubmissão de comprovante pode redefinir parcela

A rotina vigente `public.finance_upsert_from_asset(uuid,uuid,text,date)`
é `SECURITY DEFINER`, owner `postgres`, MD5
`9bc1567dad2ab1640a82bf9893fc8ef3`. Valida autor do asset R2,
OS, `auth.uid()` e acesso ao módulo `hub_os` antes de gravar.

Mesmo assim, após essa validação:

- Em `1/1`: `ON CONFLICT (os_id,installment_no) DO UPDATE` redefine
  `status='PENDING_REVIEW'`, `asset_id`, `total_installments` e
  `due_date`, e executa `DELETE` da segunda parcela.
- Em `1/2`: a primeira parcela é redefinida para
  `PENDING_REVIEW` e a segunda para `AWAITING_PROOF`, com
  `asset_id=NULL` na segunda, independentemente do status anterior.
- Em `2/2`: um `UPDATE` direto troca o comprovante e redefine o
  status da parcela 2 para `PENDING_REVIEW`.

Essas escritas privilegidas **contornam a RLS** e continuariam
possíveis após restringir INSERT/UPDATE/DELETE de `authenticated`.
Os cenários ameaçados incluem valores já `CONCILIADO` ou `LANCADO`.
A função preserva a identidade de quem fez o novo upload, mas **não
verifica o estado anterior da parcela**. A auditoria atual registra
alterações de status e notas, mas isso não evita o reset nem a deleção.

**Remediação a planejar:** fail-closed para parcelas financeiras já
conciliadas, regras explícitas para substituição/correção de
comprovantes antes de conciliação, e tratamento de ressubmissão
idempotente/concorrrente. Uma correção administrativa aprovada deve
ficar separada de novas gravações de cliente e conservar evidências.

### Risco B — DELETE direto da OS ignora proteção financeira

O código da função `public.hub_os_delete_order_secure_v2` possui
checagem de `CONCILIADO`/`LANCADO` e retenção de
`PAYMENT_PROOF`. A interface principal chama essa RPC segura.

Porém, `authenticated` ainda tem privilégio `DELETE` em
`public.os_orders` e há política RLS `os_orders_delete_admin`,
que autoriza admins com o módulo `hub_os`. Isso permite um
`DELETE FROM public.os_orders ...` diretamente pela API
(para quem satisfizer a policy), contornando o fluxo seguro,
o motivo e o registro de exclusão.

O catálogo confirma `ON DELETE CASCADE` de `os_orders`
para `os_finance_installments` **e** `os_order_assets`.
A tabela pai não tem gatilho BEFORE DELETE financeiro
que bloqueie a via direta. Consequentemente, a remoção direta
pode destruir registros de parcelas e metadados de comprovantes,
sem passar pela retenção da RPC.

**Remediação a planejar:** remover `DELETE` direto de
`authenticated`/`anon` na tabela canônica, após auditar
consumidores; preservar exclusivamente a exclusão pela RPC segura
com checagens de retenção, controle de permissão e auditoria.

### Regra de avanço

1. Não aplicar ACL do PR #523 antes de fechar os dois bloqueios.
2. Revisar integrações e plano de correção/ressubmissão financeiro
   com os responsáveis pelo processo antes de decidir a política.
3. Testar novas guards sem dados sintéticos em produção e sem forçar
   falhas sobre pagamentos reais; registrar limites não homologados.
4. Após correções, revalidar hashes/preflight e o retorno de todos
   os contratos antes de qualquer autorização de produção.
5. A 19V-C2 legada continua independente, sem implantação.

Arquivo de evidência somente leitura:
`docs/tasks/canonical-finance-integrity-blockers-READ-ONLY.sql`.
A existência dos caminhos de risco foi demonstrada pelo código
e catálogo; **nenhuma exploração nem perda real de dados foi observada.**
