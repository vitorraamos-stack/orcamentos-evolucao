# EvoluSystem — 19V-C2: implantação financeira (revisão técnica)

**Estado em 16/10/2026:** código de 19V-C e 19V-C1 já publicado; a
migration 19V-C1 de revogação de privilégios administrativos
(`20261016124926`) já foi aplicada ao Supabase. **A 19V-C2 não foi
executada.** Este PR é uma proposta isolada, sem alteração de banco.

## Descobertas confirmadas em consultas de leitura

- Os hashes do corpo das funções 19V-A e 19T não mudaram:
  `cc781eed0a4c590edb7facc4c9a731fd` e
  `8af26088723a9b4fb8dfb8863108affc`, respectivamente.
- RLS segue ativo nas tabelas legadas `os`, `os_event` e
  `os_payment_proof`.
- `authenticated` ainda tem UPDATE da tabela inteira `os` e
  INSERT/UPDATE/DELETE em `os_event`; os controles de status
  financeiro e de `PAYMENT_SUBMITTED` continuam incompletos no banco.
- Após a 19V-C1, `anon` e `authenticated` **não** têm
  `TRUNCATE`, `TRIGGER` e `REFERENCES` nessas três tabelas.
- A role `service_role` não herda `authenticated` e vice-versa;
  a helper interna não precisa conceder privilégios à service_role.
- As policies `os_update` e `os_event_insert` só autorizam
  usuários com o módulo `hub_os`; a helper definer replica o
  controle explicitamente pois não pode depender da RLS.
- A helper proposta mantém o corpo original da 19V-A, mudando
  somente schema da função, `SECURITY INVOKER` para `DEFINER`
  e a checagem de `current_user` que passará a ser `postgres`.
- As chaves estrangeiras de `os_event` e `os_payment_proof`
  para `os` têm `ON DELETE CASCADE`; o gatilho pai deve bloquear
  deleção se houver **qualquer comprovante**, mesmo PENDING sem evento.
- O fluxo de orçamento canônico usa `public.os_orders` e não
  `public.os`. Ainda é necessário verificar integrações externas
  que criem OS legada com `quote_total`/`quote_id`.
- A configuração real de schemas expostos do Data API/PostgREST
  **não foi obtida**: `current_setting('pgrst.db_schemas',true)`
  retornou NULL; isso **não** comprova schema privado fora da API.

## SQL revisado

`docs/tasks/phase-19vc2-financial-enforcement-CANDIDATE.sql`

O candidato adiciona uma precondição obrigatória da 19V-C1, mantém
`TRUNCATE/TRIGGER/REFERENCES` revogados aos papéis client-side,
delega a RPC pública invoker a uma helper definer em schema interno,
limita UPDATE genérico de `os` às colunas operacionais e impede
manipulação client-side de eventos `PAYMENT_SUBMITTED`, status
financeiro inicial e exclusão de OS com prova/evento financeiro.

**A helper definer é um aumento de privilégio intencional e sensível.**
Precisa conferir ownership, status/valor/anexo do comprovante,
`auth.uid()`, autorização ao módulo, relação OS/prova, lock order,
idempotência, falhas intermediárias e segurança contra chamadas
diretas à helper. Ser privado para o PostgREST não isenta a helper
de verificar autorização.

## Portões obrigatórios antes da implantação

1. Atestar nas configurações reais do projeto que
   `evolusystem_finance_private` **não está entre os schemas
   expostos** nem no extra search path. Não basta SQL devolver NULL.
2. Obter autorização expressa para aplicar a **C2**, distinta do
   merge deste PR e da implantação da 19V-C1.
3. Validar o SQL em PostgreSQL com semântica compatível, inclusive
   roles, triggers, grants e helper definer. CI estático não comprova
   isso. **Não executar testes sintéticos sobre dados financeiros
   reais.** O usuário não deseja criar um Supabase sandbox.
4. Conferir integrações externas que criam `public.os` com
   `quote_id`/`quote_total` antes de bloquear INSERT.
5. Verificar rollback, controle de concorrência e plano de contingência
   durante janela de aplicação. Antes de iniciar, conferir preflight
   19V-A, 19T e 19V-C1 e drift de policy/trigger.
6. Conferir que o rollback não apaga pagamentos ou evidências da 19T.
   Evitar reintroduzir TRUNCATE e outras permissões removidas pela C1.

## Matriz de testes necessária

| Cenário | Resultado esperado |
| --- | --- |
| auth ausente / anon chama RPC | Negado |
| Auth sem módulo `hub_os` | Negado |
| Auth com módulo envia comprovante de outro criador | Negado |
| Auth com módulo envia comprovante próprio PENDING válido | Uma mudança de status + um evento |
| Mesmo comprovante submetido duas vezes | Segunda resposta idempotente; zero eventos extras |
| Duas finalizações concorrentes | Serialização ou resposta idempotente |
| INSERT do evento falha | UPDATE financeiro rollback |
| Auth tenta UPDATE direto `payment_status` | Negado |
| Auth tenta INSERT/DELETE/UPDATE de `PAYMENT_SUBMITTED` | Negado |
| Auth move produção/arte/status | Mantém sucesso sob RLS |
| Gerente exclui OS com comprovante/evento financeiro | Negado |
| Gerente exclui OS sem pagamento | Continua permitido por RLS |
| service_role usa manutenção autorizada | Fluxos de serviço preservados |
| helper chamada diretamente por anon | Negado por USAGE/EXECUTE |
| helper chamada diretamente por autenticado sem módulo/prova | Negado mesmo contornando a RPC pública |

**Nenhuma dessas execuções foi reivindicada como homologada em 19V-C2.**

## Reversão — critérios de segurança

Reverter apenas a C2, mantendo a C1 e toda a imutabilidade da 19T:
restaurar o corpo original exato da RPC invoker 19V-A; remover
triggers de guardas C2; restaurar somente o UPDATE de `os` aos
usuários autenticados se estritamente necessário à continuidade
operacional; remover a helper e o schema interno depois de retirar
suas referências. Preservar filas, eventos e comprovantes existentes,
sem DML compensatório. Cada passo precisa de validação de grants,
hash original da função, RLS e histórico. Isso pode temporariamente
reabrir a escrita financeira direta, então exige decisão explícita
e janela controlada. O arquivo de rollback a seguir é apenas um
roteiro **não executável** de aprovação.

**Não aplicar sem satisfazer os portões.**
