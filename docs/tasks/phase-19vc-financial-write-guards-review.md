# EvoluSystem — 19V-C: governança de escritas financeiras legadas

**Estado: proposta de implantação, não aplicada.** A etapa 19V-B já
foi integrada e publicada. O usuário não deseja configurar sandbox,
e a implantação da 19V-C requer uma autorização distinta.

O SQL proposto está em
`docs/tasks/phase-19vc-financial-write-guards-CANDIDATE.sql`, **fora**
de `supabase/migrations` para impedir publicação acidental. Foi
preparado contra a estrutura de produção somente por consultas de
leitura. Não foi compilado ou executado em PostgreSQL.

## Achados verificados (15/10/2026)

- RPC 19V-A: `public.finalize_legacy_payment_submission(uuid)`,
  `SECURITY INVOKER`, corpo MD5
  `cc781eed0a4c590edb7facc4c9a731fd`.
- Trigger 19T de comprovantes, corpo MD5
  `8af26088723a9b4fb8dfb8863108affc`, imutabilidade ativa.
- As tabelas `public.os`, `public.os_event` e
  `public.os_payment_proof` estavam com zero linhas na auditoria;
  isso não indica que tabelas novas do EvoluSystem estejam vazias.
- RLS existe, mas `authenticated` possui UPDATE de tabela em
  `public.os` e INSERT/DELETE em `public.os_event`.
- `os_event` e `os` não têm triggers de cliente protegendo
  alterações financeiras, enquanto `os_payment_proof` mantém 19T.
- Em `public.os`, UPDATE de `status_arte`, `status_producao`,
  `status_id` e `updated_at` precisa ser preservado.
- O frontend 19V-B usa `supabase.rpc("finalize_legacy_payment_submission",
  {p_proof_id: proofId})` e não deve mudar.
- DELETE de OS pode excluir comprovantes/eventos por cascata, inclusive
  após um pagamento, caso não haja uma proteção do registro pai.

## Por que não apenas REVOKE UPDATE

A função 19V-A é `SECURITY INVOKER`: o UPDATE de
`public.os.payment_status` falharia junto com um usuário comum.
Não vamos introduzir um flag de sessão (`SET LOCAL`) como 'permissão'
porque variáveis de sessão não são uma fronteira confiável contra
clientes que tenham acesso SQL.

## Desenho proposto para revisão

1. Criar schema interno **não exposto ao PostgREST** chamado
   `evolusystem_finance_private`. Um helper `SECURITY DEFINER`
   deve executar com `search_path` vazio, recebendo somente UUID do
   comprovante, consultando `auth.uid()`, módulo `hub_os`,
   `created_by`, ordem e metadados com validação estrita.
   Por definição, o helper pode contornar RLS; os checks explícitos
   não são opcionais. Conceder EXECUTE a `authenticated` é necessário
   para o wrapper `SECURITY INVOKER`, mas o schema precisa estar fora
   das APIs expostas. Fazer revisão de segurança independente.
2. Substituir o corpo de `public.finalize_legacy_payment_submission`
   por wrapper `SECURITY INVOKER` que valida autenticação e delega
   ao helper, mantendo a mesma assinatura e JSON de resposta.
   Preservar idempotência por `payment_id`, lock de OS/proof, atomicidade
   e todas as condições financeiras de 19V-A.
3. Revogar UPDATE geral de `os` aos clientes e reatribuir somente
   colunas não-financeiras a `authenticated`.
   Bloquear UPDATE direto de `payment_status` **e `quote_total`**,
   sem bloquear `status_arte`, `status_producao` e `status_id`.
4. BEFORE INSERT/UPDATE/DELETE em `os_event` impede que papéis
   sem privilégios de integração criem, alterem ou excluam
   `PAYMENT_SUBMITTED`, mantendo intactos outros eventos e RLS.
5. BEFORE INSERT em `os` impede que clientes criem OS já como
   RELEASED/BLOCKED/SCHEDULED. BEFORE DELETE bloqueia exclusão
   de OS com evento financeiro, preservando a exclusão de OS sem
   pagamentos conforme RLS anterior.
6. Não alterar o trigger 19T nem o frontend, nem a infraestrutura R2.
   Registrar preflight e pós-checks falha-fechada.

**Limite de confiança:** `postgres` e `service_role` são papéis
privilegiados, e podem atuar como integrações administrativas; por
isso não se promete proteção contra agentes que já tenham essas
credenciais. A política deles exige auditoria própria.

## Portões para produção

- Revisão formal do SQL e da segurança do `SECURITY DEFINER`, do
  schema interno (não exposto à API) e dos grants residuais; checar
  `PUBLIC`/herança de papéis e como `PostgREST` executa RPC.
- Conferir em leitura se existem novas policies, triggers, funções
  ou dados incompatíveis; se houver drift, abortar.
- Verificar que não há chamadas de UPDATE de `quote_total` em
  integrações externas. A busca GitHub não alcança terceiros.
- Confirmar compatibilidade da cláusula de GRANT por coluna e os
  triggers de eventos/cascata em PostgreSQL local isolado.
- Testes reais com atores (sem módulo, dono, não dono, gerente,
  service_role), duas chamadas concorrentes e rollback. **Não gerar
  pagamentos sintéticos na produção.**
- Gerar migration definitiva por processo aprovado; não aplicar este
  protótipo via SQL Editor ou por merge do PR.
- Após autorização explícita para implantar, verificar grants,
  triggers, RPC, hash 19T, histórico e smoke tests da interface.
  Definir rollback que preserve comprovantes e eventos já gravados.

## Critérios de aceite não-homologados

- Cliente não consegue alterar `payment_status` ou `quote_total`
  diretamente, mas continua movimentando arte, produção e status.
- Cliente não consegue inserir, atualizar nem excluir evento
  `PAYMENT_SUBMITTED`; eventos operacionais seguem funcionando.
- Gerente não pode excluir OS após submissão financeira; pode
  excluir OS sem pagamentos se atender à RLS.
- O mesmo `p_proof_id` retorna `already_submitted` sem nova
  gravação; outro usuário não consegue finalizar comprovante alheio.
- Falha no INSERT do evento deve fazer rollback do UPDATE financeiro.
- Nenhuma elevação de privilégio via chamada direta ao helper.

**Não alegar homologação real:** testes estáticos do GitHub não
demonstram fronteira segura de roles nem comportamento transacional.
