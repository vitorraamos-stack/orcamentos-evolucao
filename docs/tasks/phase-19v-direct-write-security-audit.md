# EvoluSystem — 19V / auditoria dos caminhos de escrita financeira

**Escopo:** revisão somente-leitura do repositório e do esquema Supabase
em 15/10/2026. Não é uma homologação funcional. Nenhuma operação SQL de
escrita foi realizada.

## Evidências observadas

| Superfície | Constatação | Consequência |
|---|---|---|
| `src/modules/hub-os/pages/OsDetailPage.tsx` | O envio executa `updateOs(payment_status)` antes de `createOsEvent(PAYMENT_SUBMITTED)` | A atualização e o evento não são atômicos |
| `src/modules/hub-os/api.ts` | `updateOs` recebe `Partial<Os>` e faz UPDATE genérico; `updateOsPaymentStatus` também faz UPDATE direto (não há chamadores localizados na busca do repositório) | Os auxiliares permitem alterações financeiras fora de uma RPC |
| Quadros Arte, Produção e Kanban | Os usos localizados de `updateOs` alteram status operacionais, não `payment_status` | É possível introduzir guarda específica da coluna financeira sem bloquear as telas operacionais |
| `public.os` | `authenticated` tem UPDATE de tabela e policy `os_update` por acesso ao módulo `hub_os` | RLS atual não obriga uma RPC para status financeiro; `quote_total` também é editável |
| `public.os_event` | `authenticated` tem INSERT e a policy `os_event_insert` aceita usuários do módulo | Um usuário autorizado pode emitir `PAYMENT_SUBMITTED` sem seguir o novo procedimento |
| `public.os_event` | DELETE com `os_event_delete` permitido a gerente do módulo | Histórico `PAYMENT_SUBMITTED` pode ser excluído por gerente; o bloqueio 19T de comprovantes sem anexo depende da existência desse evento |
| `public.os_event` | Apenas índice PK por `id`; nenhum índice único por `(os_id,payload->>'payment_id')` | Reenvios/concorrência podem gerar eventos duplicados |
| `public.os_payment_proof` | Um trigger 19T ativo, RLS e guardas de mutação; MD5 `8af26088723a9b4fb8dfb8863108affc` | A implantação deve preservar a proteção de comprovantes e evitar modificar o trigger |
| `service_role` | Mantém privilégios elevados para agentes/sincronização | Bloqueio de clientes não deve interromper integração técnica, mas operações privilegiadas precisam de trilha de auditoria |

A busca de código cobriu `payment_status`, `PAYMENT_SUBMITTED`,
`updateOsPaymentStatus`, `updateOs(` e `createOsEvent(`.
Isso não demonstra inexistência de agentes externos ao repositório.

**Observação de escopo:** contagens legadas de `public.os`,
`public.os_payment_proof` e `public.os_event` eram zero na consulta de
referência. Tabelas canônicas mais novas do sistema não foram consideradas
vazias.

## Conclusão de segurança

Um RPC `SECURITY INVOKER` **é adequado para a primeira etapa aditiva**
da transação: respeita RLS e torna UPDATE/INSERT atômicos para quem chama
a função. **Não basta como enforcement global**, pois as permissões
atuais continuam permitindo UPDATE/INSERT diretos. Não declarar
imutabilidade de `PAYMENT_SUBMITTED` nem consistência global na fase
aditiva.

Apenas revogar UPDATE de `payment_status` não é suficiente enquanto
continuar existindo um GRANT de UPDATE em nível de tabela. Revogar
UPDATE de tabela com reGRANT granular exigiria mapear todas as colunas
utilizadas nas telas operacionais; uma função `SECURITY INVOKER` sem
esse privilégio também deixaria de atualizar status financeiro.
Não introduzir combinações de grants sem testar os dois caminhos.

## Sequência de implantação segura — requer autorizações independentes

**19V-A, preparação aditiva**
1. Produzir migration com a CLI Supabase, checando schema, ACL, RLS,
   digest 19T, dados legados e colisão de nomes antes de qualquer DDL.
2. Adicionar somente índice único parcial de submissão e RPC de
   finalização `SECURITY INVOKER`, com EXECUTE exclusivo para
   `authenticated`. Deixar o frontend antigo funcionando.
3. Verificar imediatamente pós-condições e backups/rollback previstos.
   Não afirmar que o sistema já impede gravações manuais diretas.

**19V-B, migração do consumidor**
1. Trocar exclusivamente o fluxo financeiro para
   `supabase.rpc('finalize_legacy_payment_submission', { p_proof_id })`,
   sem alterar quadros de arte/produção.
2. Recarregar a OS e o histórico após a RPC. Distinguir resposta
   `already_submitted` de falha desconhecida sem reexecutar o upload R2.
3. Validar com mocks, revisão humana e, se vier a ser autorizado,
   testes reais de autenticação e concorrência. Não tocar dados reais
   apenas para gerar evidência.

**19V-C, enforcement depois da adoção**
1. Proteger especificamente mudanças diretas de `os.payment_status`,
   criação de `os_event(PAYMENT_SUBMITTED)` e a exclusão desses
   eventos por usuário autenticado, preservando outros eventos de
   auditoria e atualizações operacionais.
2. Avaliar função privilegiada extremamente restrita, se necessária
   para que o caminho autorizado continue funcionando: não assumir
   que um trigger aceita chamada `SECURITY INVOKER` e bloqueia as
   demais pelo mesmo `current_user`.
3. Revisar eventuais sessões antigas, agentes externos,
   `quote_total`, privilégios de `service_role` e política de
   recuperação/estorno.
4. Elaborar migration independente, com preflight/pós-check e
   autorizações explícitas.

## Cenários que precisam bloquear o avanço

- Evento já existente com identificador de comprovante inválido,
  ausente ou duplicado, sem revisão prévia.
- Drift de guardas 19T, policies, grants, triggers ou estrutura.
- RPC que aceita `user_id`, valor, status ou `os_id` controlados
  livremente pelo cliente, permitindo alteração de comprovante alheio.
- Falha da inserção do evento sem rollback da mudança de status.
- Um segundo envio para o mesmo comprovante criando novo evento.
- Restrições que impeçam editar `status_arte`, `status_producao`,
  `status_id` ou criar eventos operacionais.
- Tentativa de aplicar SQL em produção sem autorização expressa.

## Estado

PR #488 permanece em Draft. Os scripts em `docs/tasks` são propostas;
**não são arquivos de migration**. O diretório `supabase/migrations`
permanece inalterado. Nenhum merge, deploy manual ou escrita em banco
é parte desta auditoria.
