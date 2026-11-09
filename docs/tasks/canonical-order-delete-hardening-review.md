# EvoluSystem — Bloquear DELETE direto da OS canônica

**Estado:** proposta de segurança, somente PR Draft. **Não aplicar** no Supabase, nem realizar merge sem autorização posterior.

## Motivo

As rotas normais de exclusão (`DeleteOrderDialog` →
`orderGovernanceRepository` → `hub_os_delete_order_secure_v2`)
exigem gerente/admin, justificativa, confirmação, e bloqueiam OSs
com parcelas `CONCILIADO` ou `LANCADO`, ou arquivos do tipo
`PAYMENT_PROOF`. A função segura grava a auditoria de exclusão.

Porém a role `authenticated` tem `DELETE` direto em
`public.os_orders`, com RLS
`os_orders_delete_admin`. Um admin com `hub_os` pode excluir
diretamente a OS, contornando a função. As FKs `ON DELETE CASCADE`
propagam a exclusão às parcelas (`os_finance_installments`) e
aos metadados de arquivos (`os_order_assets`). Não há um trigger
financeiro BEFORE DELETE na OS que feche esse caminho.

### Alteração mínima proposta

- `REVOKE DELETE ON public.os_orders FROM anon,authenticated`.
- `DROP POLICY os_orders_delete_admin ON public.os_orders`.
- Manter RLS, policies SELECT e UPDATE, grants ao `service_role`
  e owner `postgres`.
- Preservar as três funções `SECURITY DEFINER`: prévia,
  exclusão segura V2 e wrapper de compatibilidade.
- O preflight aborta na menor divergência das ACLs, MD5 das
  funções, políticas ou FKs; o postcheck exige proteção efetiva.
- Este SQL fica apenas em `docs/tasks`, não entra em
  `supabase/migrations`.

### Benefícios e limites

A exclusão de OS pela interface existente continua via a RPC
privilegiada, sujeita às regras de retenção. Chamadas
`DELETE /rest/v1/os_orders` de usuários comuns deixam de ser
autorizadas, inclusive para admins.

**Não protege, isoladamente, o DELETE direto de parcelas** em
`os_finance_installments`; esta superfície será endurecida no
PR #523, hoje bloqueado. Também não impede deleções via
credenciais `service_role` ou pelo proprietário do banco:
o uso destas credenciais deve ser restrito e auditado.

### Homologação e compatibilidade pendentes

- Pesquisar integrações externas com token `authenticated`
  que executem DELETE direto na tabela pai; busca no GitHub
  não garante inexistência de consumidores externos.
- Validar sessão real de gerente/admin usando
  `hub_os_delete_order_preview_secure`, inclusive estado
  `allowed=false` para retenção financeira.
- Validar em ambiente apropriado o comportamento de
  `hub_os_delete_order_secure_v2` com a nova ACL.
- Não criar OS fictícia, não excluir nenhuma OS real em
  produção para testes.
- Antes de aplicar em produção, nova autorização explícita e
  rechecagem dos hashes, políticas e FKs.

## Correção administrativa de parcelas concluídas — desenho inicial

**Decisão já aprovada:** parcelas em `CONCILIADO` ou
`LANCADO` são imutáveis no fluxo comum; correções precisam
de procedimento administrativo separado com histórico.

Fluxo mínimo sugerido, sujeito à decisão final do gestor:

1. Administrador habilitado em `hub_os_financeiro` solicita
   correção apontando a parcela e um motivo obrigatório;
   não usar a função de upload comum para contornar o bloqueio.
2. A rotina segura verifica identidade `auth.uid()`, direitos
   administrativos, OS, parcela, estado atual e propriedade
   do novo comprovante R2, quando aplicável.
3. Salvar uma evidência de **antes e depois** com ator,
   justificativa, referência a comprovantes antigos/novos e
   data; nunca apagar o arquivo anterior nem alterar a auditoria.
4. Usar uma RPC transacional própria com idempotência por
   identificador da operação, bloqueio de concorrência e
   confirmação explícita, sem atualização silenciosa.
5. Preservar a segunda parcela independente: a primeira
   conciliada não impede o recebimento normal da segunda
   ainda não concluída.

Ainda **não** existe DDL de retificação administrativa neste
PR. Antes da implementação é preciso decidir quem pode
autorizar a correção, quais estados/transições serão aceitos
e se será necessária aprovação de segunda pessoa. Não
presumir regras ainda não aprovadas.

## Relação com outros trabalhos

- PR #527: candidata de proteção da RPC de comprovantes, não aplicado.
- PR #523: candidato de ACL de parcelas, bloqueado por dependências.
- 19V-C2 legada: separada e sem aplicação.
- A criação da OS canônica e o financeiro atual não são
  modificados por esta proposta.

**Fonte de evidência:** catálogo do Supabase e código da
main em 19/10/2026. Nenhuma OS ou transação foi alterada.
