# EvoluSystem — Comprovante de parcela conciliada / lançada

**Decisão aprovada em 19/10/2026:** quando uma parcela estiver em
`CONCILIADO` ou `LANCADO`, o fluxo comum **não pode** substituir
seu comprovante, reverter o status ou alterar parcelamento/dados
estruturais. Eventual correção exige um **procedimento administrativo
separado e auditável**, ainda não implementado.

**Estado:** somente proposta Draft. Nenhum SQL aplicado em produção,
nenhum pagamento fictício e nenhum merge autorizado nesta etapa.

## Regras por operação

| Operação | Parcela 1 encerrada | Parcela 2 encerrada | Ação |
|---|---|---|---|
| Reenviar como `1/1` | bloquear | bloquear | altera primeira e apaga a segunda |
| Reenviar como `1/2` | bloquear | bloquear | modifica primeira e segunda |
| Enviar `2/2` | **permitir** | bloquear | modifica somente segunda |
| Qualquer entrada acima sem parcela encerrada | aplicável | aplicável | preservar comportamento normal, sujeito a RLS, validação de asset e checks |

O código preserva a validação existente de `auth.uid()`,
`has_module_access(...,'hub_os')` e do comprovante R2
(`uploaded_by`, `os_id`, `asset_type`, `storage_provider`,
`deleted_from_storage_at`, `error`). O usuário não informa
`status`, valor financeiro ou criador. A função segue
`SECURITY DEFINER` e passa a definir `search_path` vazio,
qualificando todas as referências aos schemas.

### Concorrência e integridade

O lock `FOR NO KEY UPDATE` na OS canônica é adquirido antes dos
locks `FOR UPDATE` nas parcelas, inclusive quando ainda não há
parcelas. Isso serializa dois envios comuns concorrentes da mesma OS.
O lock de parcela sincroniza com atualização de status feita pelo
Financeiro, de forma que a verificação do estado seja feita após
esperar a transação que já a está modificando.

**Limite:** nenhuma das propriedades acima foi executada em
concorrência com sessões reais: são inspeções técnicas do candidato
e testes estáticos. É indispensável validação autenticada antes de
aplicar. A ordem dos locks foi escolhida para evitar conflito do
lock pai com o `KEY SHARE` usado por FK do evento de auditoria.

### Não coberto nesta proposta

- **Alteração direta por `authenticated`:** o PR #523 permanece
  bloqueado; ainda existe `UPDATE` amplo em
  `os_finance_installments`. A correção da RPC não impede acesso
  direto às colunas enquanto os grants não forem restringidos.
- **Exclusão direta de OS:** o privilégio de `DELETE` em
  `public.os_orders` continua permitindo que admins com permissão
  contornem a RPC segura e acionem `ON DELETE CASCADE`.
- **Procedimento de retificação administrativa:** será planejado
  depois, com autorização restrita, justificativa obrigatória,
  histórico imutável e referência ao comprovante anterior. Não
  permitir edição silenciosa de pagamentos concluídos.
- **Uploads em parcelas não concluídas:** seguem regras de
  substituição já vigentes. Não há nesta versão política nova
  contra duplicidade de upload/R2 em parcela `PENDING_REVIEW`.
- **Integrações externas:** devem ser revisadas antes do rollout.
- **Teste transacional, idempotência e concorrência:** pendentes;
  não criar dados financeiros fictícios em produção.

## Pré-requisitos para aplicação futura

1. Confirmar MD5 da função base
   `9bc1567dad2ab1640a82bf9893fc8ef3`, RLS e política
   atual de acesso, grants de execução e trigger de auditoria.
2. Revisar a regra com o Financeiro e a distinção entre segunda
   parcela ainda aberta e primeira já conciliada.
3. Validar sintaxe PL/pgSQL, sem executar no Supabase de produção.
4. Concluir estratégia de bloqueio de escrita direta e exclusão
   direta em PRs separados; não afirmar proteção completa até lá.
5. Exigir autorização específica para migrar o SQL candidato para
   `supabase/migrations`, depois homologação real e observação.

A 19V-C2 do esquema antigo `public.os` permanece independente e
não é aplicada por esta proposta.

Fontes:
- https://www.postgresql.org/docs/17/explicit-locking.html
- https://supabase.com/docs/guides/database/postgres/row-level-security
