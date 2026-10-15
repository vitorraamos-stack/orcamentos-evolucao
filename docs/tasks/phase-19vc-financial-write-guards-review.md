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
- As permissões atuais concedem **TRUNCATE, TRIGGER e REFERENCES**
  em `public.os` tanto a `authenticated` quanto a `anon`.
  `TRUNCATE` ignora RLS e gatilhos de linha; o SQL candidato
  revoga esses privilégios e revisa `TRIGGER/REFERENCES` nos
  dois objetos financeiros vinculados.
- Em `public.os`, UPDATE de `status_arte`, `status_producao`,
  `status_id` e `updated_at` precisa ser preservado.
- O frontend 19V-B usa `supabase.rpc("finalize_legacy_payment_submission",
  {p_proof_id: proofId})` e não deve mudar.
- As duas FKs `os_event_os_id_fkey` e
  `os_payment_proof_os_id_fkey` usam ON DELETE CASCADE. Logo,
  proteger somente `PAYMENT_SUBMITTED` **não** impede exclusão de
  comprovantes pendentes ou já anexados sem evento. A proteção do pai
  precisa bloquear se houver **qualquer comprovante** ou evento
  financeiro, inclusive comprovante pendente sem anexo.

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
   Também revogar TRUNCATE/TRIGGER/REFERENCES desnecessários dos
   papéis de cliente, pois RLS não restringe TRUNCATE.
4. BEFORE INSERT/UPDATE/DELETE em `os_event` impede que papéis
   sem privilégios de integração criem, alterem ou excluam
   `PAYMENT_SUBMITTED`, mantendo intactos outros eventos e RLS.
5. BEFORE INSERT em `os` impede que clientes criem OS já como
   RELEASED/BLOCKED/SCHEDULED, ou injetem `quote_total` ou
   `quote_id` na criação de uma OS legada. BEFORE DELETE bloqueia exclusão
   de OS com **qualquer comprovante financeiro** ou
   `PAYMENT_SUBMITTED`, preservando a exclusão de OS sem
   comprovantes/eventos financeiros conforme RLS anterior.
   O preflight verifica explicitamente ambas as FKs de cascata.
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
- Gerente não pode excluir OS com comprovantes, mesmo PENDING,
  sem arquivo ou sem evento; também não pode excluir OS com evento
  `PAYMENT_SUBMITTED`. Pode excluir OS sem artefatos financeiros,
  desde que atenda à RLS.
- O mesmo `p_proof_id` retorna `already_submitted` sem nova
  gravação; outro usuário não consegue finalizar comprovante alheio.
- Falha no INSERT do evento deve fazer rollback do UPDATE financeiro.
- Nenhuma elevação de privilégio via chamada direta ao helper.

## Revisão de segurança adicional — pontos que continuam bloqueando aplicação

- A helper `SECURITY DEFINER` contorna RLS. Validar em PostgreSQL
  os casos dono/não dono, usuário sem módulo, anônimo, gerência,
  concorrência e idempotência. A combinação
  `GRANT USAGE` de schema interno + `GRANT EXECUTE` ao autenticado
  é uma superfície de execução privilegiada, mesmo fora do Data API.
  As mesmas verificações devem ser efetivas ao chamar a helper
  diretamente via SQL, não apenas pelo wrapper.
- Confirmar fora deste protótipo que o schema interno não será exposto
  nas configurações do Data API/PostgREST. A auditoria SQL não confirma
  a configuração da API.
- A criação canônica de OS por orçamento utiliza `public.os_orders`
  no fluxo 18E; as tabelas `public.os` são **legadas**. A proposta
  bloqueia `quote_total` e `quote_id` informados diretamente por
  clientes na criação legada, além de UPDATE direto. Verificar
  **todos os possíveis agentes externos** que criem OS legada vinculada
  a orçamento: esta restrição pode rejeitar integrações existentes.
  Ainda não se deve alegar equivalência com o vínculo canônico,
  nem segurança global sem homologação.
- Confirmar explicitamente as permissões de `PUBLIC`, grants herdados,
  triggers habilitados, privilégios de `service_role`, e o impacto
  das FKs CASCADE antes de aplicar.
- Conferir que o GRANT original de `TRUNCATE` em `os` e de
  `TRIGGER/REFERENCES` nas três tabelas foi removido dos clientes,
  preservando somente papéis de serviço com essas capacidades.
- Os checks SQL adicionais agora exigem manutenção das policies
  `os_update` e `os_event_insert` e proíbem que `authenticated`
  herde `postgres`/`service_role`. A pós-condição verifica
  `USAGE`/EXECUTE efetivo do schema/função privados: autorizado
  somente para `authenticated`, sem `CREATE`, sem acesso
  do `anon` e do `service_role`. O papel `postgres` proprietário
  mantém privilégios internos por design.
- Para voltar atrás, elaborar migration **separada e autorizada** que
  restaure o corpo 19V-A do RPC e somente as permissões operacionais
  necessárias; remover triggers/helpers em ordem segura e nunca
  apagar evidências financeiras ou desfazer a 19T. Não executar um
  rollback improvisado via SQL Editor.
- Não marcar como apta a produção antes de testes reais de função
  privilegiada e concorrência. Sem ambiente isolado e sem uso de
  dados de cliente, a revisão pode concluir apenas testes estáticos.

**Não alegar homologação real:** testes estáticos do GitHub não
demonstram fronteira segura de roles nem comportamento transacional.
