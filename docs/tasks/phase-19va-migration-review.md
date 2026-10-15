# 19V-A — Migration aditiva de finalização financeira (candidata)

**ESTADO: SQL PREPARADO, NÃO GERADO PELA CLI, NÃO APLICADO.**

A infraestrutura deste turno não dispõe da Supabase CLI e a instalação
temporária não foi concluída. Para cumprir o processo de migrations,
gerar o arquivo definitivo com `supabase migration new
phase_19va_atomic_payment_finalization` em uma máquina autorizada,
transferindo o conteúdo revisado de
`docs/tasks/phase-19va-migration-CANDIDATE.sql`. Não inventar versões de
migration nem executar o conteúdo por copiar/colar em produção.

A aplicação no Supabase exigirá **autorização nova**, distinta da revisão
do PR e do merge. Um merge isolado deste PR **não aplica** SQL porque
o arquivo permanece fora de `supabase/migrations`.

## Base verificada por consultas somente-leitura

- Supabase de produção: `evolucao-orcamentos`
  (`zffpvykekwrmkbyjsgbh`).
- Migração mais recente: 19T,
  `20261014185916_phase_19t_legacy_payment_financial_immutability`.
- Gatilho `trg_guard_legacy_payment_proof_mutations` habilitado e
  fonte `guard_legacy_payment_proof_mutations()` MD5
  `8af26088723a9b4fb8dfb8863108affc`.
- Tabelas legadas `os`, `os_payment_proof`, `os_event`: **0
  registros no momento da auditoria**, não é promessa para aplicação
  futura. Isso não descreve as tabelas mais novas do EvoluSystem.
- `os_event` tem apenas `os_event_pkey`, sem índice de unicidade de
  submissão; nenhum evento duplicado ou malformado encontrado.
- Políticas `os_update`, `os_event_insert` e `os_event_read`
  preservam permissão por módulo `hub_os` para `authenticated`.

## Alcance do candidato

1. Pré-condições abortam ao detectar colisão de objeto, RLS, 19T,
   grants/policies, histórico inválido ou duplicidade inesperados.
2. Novo índice parcial
   `os_event_payment_submission_once` evita dois eventos
   `PAYMENT_SUBMITTED` para a mesma OS e comprovante.
3. Novo RPC
   `public.finalize_legacy_payment_submission(p_proof_id uuid)`
   executado com `SECURITY INVOKER` e `search_path` vazio.
4. Valida `auth.uid()`, acesso ao módulo, autor, estado e metadados
   do comprovante; trava primeiro a OS, depois o comprovante.
5. Atualiza `os.payment_status` e insere o evento na mesma chamada
   transacional. Se falhar o INSERT, o UPDATE é revertido.
6. Repetição do mesmo `payment_id` retorna
   `already_submitted=true` sem nova gravação, desde que o evento
   existente tenha autor válido.
7. Calcula o status no servidor considerando o dia de São Paulo.
8. Restringe EXECUTE da função a usuários `authenticated` e verifica
   pós-condições. Não altera políticas das tabelas nem frontend.

## Limitações técnicas que impedem atestar homologação

- SQL não foi executado nem compilado contra PostgreSQL neste turno.
  GitHub Actions executará **testes de contrato estáticos**, não
  transações reais, RLS de usuários nem concorrência do banco.
- Um objeto R2 pode existir mesmo se o banco não tiver metadados;
  uma transação PostgreSQL não é transação distribuída com R2.
- Escritas diretas continuam disponíveis com grants atuais. O novo
  índice limita duplicação por chave, mas 19V-C precisa impedir
  inserção falsificada de eventos, atualização do status e exclusão
  por gerente sem rito de reconciliação.
- `updateOsPaymentStatus` permanece no API legado. O cliente ainda
  chama `updateOs` e `createOsEvent` separadamente até 19V-B.
- Atualização e evento para duas provas **diferentes** da mesma OS
  são serializados; status financeiro final ainda reflete a operação
  mais recente (sem agregação de recebimentos).
- Se houver diferenças no fuso do navegador, a antiga regra de
  pagamento recebido hoje pode divergir da nova regra do servidor.
- A checagem 19T usa um hash fixo, propositalmente falha quando a
  função existente for alterada.

## Implantação futura (somente com aprovação)

1. Validar o SQL em ambiente PostgreSQL compatível, com dados
   sintéticos e papéis autenticado/não autorizado. O usuário optou
   por **não configurar sandbox remoto**; não usar produção para
   executar cenários destrutivos.
2. Regenerar uma migration versionada com Supabase CLI e revisar
   diff, dependências, grants, RLS, e tempo de bloqueio do índice.
3. Fazer nova inspeção de leitura na produção para verificar o drift.
4. Após autorização explícita, aplicar somente 19V-A e conferir os
   pós-checks. Não conectar o frontend à função antes disso.
5. 19V-B e 19V-C são fases separadas com autorizações próprias.

PR de arquitetura relacionado: #488. A proposta desse PR permanece
independente; não realizar merges cruzados entre os dois.
