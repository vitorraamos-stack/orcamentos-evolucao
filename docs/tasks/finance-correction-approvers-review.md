# EvoluSystem — Aprovação administrativa de retificações

**Regra aprovada:** administradores e responsáveis autorizados do Financeiro
podem aprovar retificações de parcelas já `CONCILIADO` ou `LANCADO`.

**Apenas proposta em Draft. Nenhuma autorização foi atribuída ou instalada.**

## Implementação da autorização

A tabela `profiles` possui `role` e `is_super_admin`.
A função atual `is_admin(uid)` considera `admin` **e** `gerente`,
por isso **não poderá ser usada isoladamente**.

Aprovar exige uma das três condições verificadas pelo backend:

- `profiles.role='admin'`; ou
- `profiles.is_super_admin=true`; ou
- acesso ao módulo `hub_os_financeiro` **mais** autorização expressa
  ainda ativa no cadastro privado de aprovadores.

Ter acesso comum ao Financeiro não basta. Gerentes sem autorização
específica ou superadmin não recebem esse privilégio automaticamente.

O SQL candidato em
`docs/tasks/finance-correction-approvers-CANDIDATE.sql`
apenas apresenta um schema privado de aprovadores e uma RPC
`can_approve_finance_correction()` que consulta a permissão
do próprio usuário autenticado. A gestão de quem entra/sai do cadastro
privado ainda requer procedimento seguro, sem conceder acesso direto
à tabela de aprovadores aos papéis `anon` e `authenticated`.
O schema privado não deverá ser exposto no Data API.

## Fluxo proposto de retificação (a implementar)

1. A partir da parcela encerrada, **Solicitar retificação** abre
   um formulário simples de motivo obrigatório, natureza da correção
   e comprovante substituto, quando aplicável.
2. Registrar solicitação **PENDENTE** sem alterar parcela/comprovante.
3. Aprovador elegível vê o comparativo **Antes / Depois**, motivo,
   estado atual, usuário solicitante e documentos.
4. **Aprovar** ou **Rejeitar**, com justificativa registrada.
5. Apenas RPC transacional própria poderá executar aprovação
   vigente: confere `auth.uid()`, elegibilidade, status atual,
   consistência do comprovante R2, versão da parcela, concorrência,
   idempotência e registro imutável do evento.
6. Guardar auditoria append-only com solicitante, aprovador,
   executor, data, motivo, valores anteriores/novos, IDs de
   comprovantes e OS. **Nunca remover o arquivo original**.
7. Em conflito de versão, abortar sem mutações e solicitar nova análise.

A aprovação **não** concede UPDATE/DELETE direto em
`os_finance_installments`.

## Decisão ainda necessária

**Quem solicitou a retificação poderá aprovar a própria solicitação?**
Não presumir aprovação individual ou dupla aprovação antes dessa
definição. O SQL candidato não cria solicitações, aprovações nem
executa alterações financeiras.

## Dependências e segurança

- PR #527: proteção da RPC comum contra substituição de parcela encerrada.
- PR #529: bloqueio de exclusão direta da OS canônica.
- PR #523: ACL das parcelas; ainda bloqueado, pois há dependências
  de integridade e testes pendentes.
- 19V-C2: apenas para OS legadas, permanece separada.
- Antes de implantação, confirmar schemas expostos, grants, RLS,
  testes reais de autorização, tratamento de concorrência,
  registros originais e integrações externas. Não criar dados
  financeiros fictícios em produção ou Supabase sandbox.

Nenhum SQL deste PR deve ser aplicado, movido para
`supabase/migrations`, integrado à main ou publicado
sem nova autorização explícita.
