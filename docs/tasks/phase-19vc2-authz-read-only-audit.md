# EvoluSystem — 19V-C2: evidências de autorização, 16/10/2026

## Resultado observado (somente leitura)

Consultas realizadas no projeto Supabase de produção
`zffpvykekwrmkbyjsgbh`:

- Migration `20261016124926_phase_19vc1_revoke_dangerous_legacy_table_privileges` presente.
- Os três objetos legados `os`, `os_event`,
  `os_payment_proof` permanecem com RLS habilitada.
- `authenticated` ainda dispõe de `UPDATE` da OS e de
  `INSERT` no histórico: esperado até a 19V-C2.
- Nenhum schema `evolusystem_finance_private` nem trigger 19V-C2
  existe em produção.
- Corpo do RPC 19V-A continua
  `cc781eed0a4c590edb7facc4c9a731fd` e guarda 19T
  `8af26088723a9b4fb8dfb8863108affc`.
- As ACLs explícitas por coluna de `public.os` ainda são vazias;
  o GRANT geral do usuário autenticado é a configuração anterior.
- O dashboard conectado informa projeto operacional e última migration
  19V-C1. **Não confirmou os schemas expostos pelo PostgREST**.

## Correção de interpretação importante

O helper proposto é `SECURITY DEFINER`: **suas consultas não
são protegidas pela RLS do usuário chamador**. Por isso,
a expressão histórica "discover under RLS" no SQL candidato era
incorreta e foi substituída por comentário explícito. Permanece
necessário validar autorização ao módulo, identidade de criador do
comprovante, estado, valor e vínculo entre OS e comprovante.
O mesmo `auth.uid()` deve funcionar para a chamada direta autorizada
e negar chamadas anônimas e de outros criadores.

## Critérios que continuam NÃO verificados

1. Ler no dashboard do projeto **Integrations → Data API → Settings**
   o conjunto real dos `Exposed Schemas` e `Extra Search Path`
   e confirmar que `evolusystem_finance_private` está ausente.
2. Confirmar comportamento `SECURITY DEFINER` em PostgreSQL com
   usuário autorizado, sem módulo, não dono, anônimo e
   `service_role`; nenhuma chamada com dados financeiros reais.
3. Validar SQL, grant por coluna, transação de evento, idempotência
   e exclusão em cascata numa execução PostgreSQL autorizada.
4. Verificar integrações externas que inserem ou editam
   `quote_total` e `quote_id` na tabela legada.
5. Aprovar plano de reversão mantendo 19V-C1 e a imutabilidade 19T.

**Resultado:** não liberar aplicação de 19V-C2. Esta revisão não
moveu dados, não alterou grants e não criou pagamentos.
