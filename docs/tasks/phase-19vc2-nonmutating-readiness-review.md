# 19V-C2 — Auditoria não mutável e matriz de homologação

**Data da observação:** 16/10/2026. **Estado: parcial; sem implantação da 19V-C2.**

Esta etapa foi autorizada para avançar na **homologação transacional**,
com as restrições do projeto: não criar Supabase separado/sandbox,
não produzir transações financeiras fictícias em produção, não aplicar
19V-C2 prematuramente e evitar Previews/deploys desnecessários.

## O que foi confirmado (leitura do banco e código)

- Migração C1 instalada, hashes e atributos das funções 19T e 19V-A intactos.
- A RPC pública atual ainda é `SECURITY INVOKER`, usa
  `auth.uid()` e exige o módulo `hub_os`.
- Uma índice único parcial válido em `public.os_event` evita repetição
  de `PAYMENT_SUBMITTED` com mesmo `(os_id,payment_id)`.
- O SQL candidato C2 faz lock da OS (`FOR UPDATE`) **antes** do
  lock do comprovante, testa evento existente antes de atualizar
  estado e insere evento na mesma função transacional.
- O SQL candidato inclui helper `SECURITY DEFINER`, checagens
  próprias de `auth.uid()`, módulo e `created_by`, guardas
  de eventos, bloqueio de deleção em cascata e revogação de
  `MAINTAIN` para clientes.
- O frontend possui testes unitários de proteção de escrita,
  validação da resposta RPC, detecção de evento próprio e
  prevenção de envio duplo na interface.
- As três tabelas financeiras legadas possuem RLS; as FKs de
  evento/comprovante para OS usam `ON DELETE CASCADE`.
- **Nenhuma OS, evento ou comprovante legados existiam** quando
  a consulta foi executada. Sem dados reais, não há caso positivo
  elegível à execução.
- O Data API tinha schemas `public`/`graphql_public` expostos e
  `public`/`extensions` no Extra Search Path na conferência visual
  de 16/10; essa configuração precisa ser conferida novamente no
  momento da implantação.

## Matriz com diferença entre evidência e homologação

| Cenário | Evidência existente | Estado |
|---|---|---|
| Negar anon / sem módulo | Grants, código e RLS | Inspeção estática; sessão JWT não testada |
| Negar comprovante de outro usuário | Checagem de `created_by` no helper | Não executado com sessão real |
| Pagamento PENDING válido | Código e checagens | Não executado; não há registros legados |
| Finalização atualiza OS + insere evento | Um mesmo corpo PL/pgSQL | Não executado na 19V-C2 |
| Retry idempotente | Evento existente consultado primeiro; índice único | Não executado na 19V-C2 |
| Dois envios concorrentes | Lock da OS, depois comprovante | Não executado em sessões simultâneas |
| Falha ao inserir evento reverte UPDATE | Transação PostgreSQL | Não induzida; não comprovada na 19V-C2 |
| UPDATE financeiro direto negado | REVOKE de UPDATE no candidato | C2 não aplicada |
| INSERT/UPDATE/DELETE de PAYMENT_SUBMITTED negado | Triggers no candidato | C2 não aplicada |
| Atualizações de arte e produção | GRANT por coluna no candidato | C2 não aplicada |
| Exclusão de OS com provas bloqueada | Trigger pai no candidato | C2 não aplicada |
| service_role preservada | Código e preflight ACL | C2 não aplicada |

**Não confundir:** testes Vitest e checagens de catálogo NÃO
executam DML concorrente, não validam credenciais reais nem certificam
um `SECURITY DEFINER` instalado.

## Próximo ponto operacional sem sandbox/dados sintéticos

1. **Não executar a 19V-C2 ainda.** Seguir com a 19T/19V-A/19V-C1
   presentes e controles do frontend.
2. Quando houver um pagamento legítimo no fluxo legado, identificar
   em operação a elegibilidade para teste consentido. Não usar
   comprovante ou usuário de terceiros, nem criar cobrança artificial.
3. Planejar janela curta com operador autenticado autorizado,
   observação somente-leitura antes/depois, auditoria de eventos e
   monitoramento de erros; a implantação da 19V-C2 exige autorização
   separada. Não tentar gerar erro intencional em pagamentos reais.
4. Se não houver uso real da OS legada, reavaliar se manter e
   implantar C2 nela tem benefício operacional, antes de introduzir
   triggers e helper privilegiada.
5. Testes de concorrência/falha induzida **não são seguros** em
   pagamentos reais e continuam pendentes sem ambiente de teste.
   Não relatar a 19V-C2 como homologada.

## Como reproduzir a auditoria sem mutações

Executar apenas
`docs/tasks/phase-19vc2-nonmutating-production-gates.sql`
com a ferramenta SQL de leitura e comparar hashes, RLS, índices,
contagens e privilégios. O resultado **sempre** inclui
`c2_transactions_homologated=false`,
`c2_concurrency_homologated=false` e
`real_authenticated_jwt_homologated=false`; esses valores
não podem ser promovidos por inferência de metadados.

**Sem deploy de aplicação, alterações em banco ou pagamentos nesta etapa.**
