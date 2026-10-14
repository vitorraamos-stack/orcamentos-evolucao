# EvoluSystem — 19U: homologação funcional dos comprovantes legados

**Situação: preparação; homologação funcional NÃO executada.** Este PR não altera runtime, banco, policies, funções, triggers, arquivos de migração ou credenciais.

## Base técnica confirmada (14/10/2026)

- 19T está na `main` (merge do PR #479, SHA `9b72575ffe962efed33e5a6d9d11e46486d9df3f`) e publicada automaticamente na Vercel (`READY`).
- Migration registrada no Supabase: `20261014185916_phase_19t_legacy_payment_financial_immutability`. Hash `md5(prosrc)=8af26088723a9b4fb8dfb8863108affc` na verificação pós-merge.
- `public.guard_legacy_payment_proof_mutations()`: `SECURITY INVOKER`, `search_path=""`, três guardas 19T presentes, trigger ativo; `service_role` preservada.
- UI legada: `src/modules/hub-os/pages/OsDetailPage.tsx` chama `createPaymentProof` (PENDING, sem anexo) → presign R2 → PUT R2 → `updatePaymentProof` (metadados) → `updateOs` (status) → `createOsEvent` (`PAYMENT_SUBMITTED`).
- O rollback atual chama `deletePaymentProof` somente quando existe arquivo selecionado e `uploadedKey` ainda está vazio. Portanto, não é seguro presumir rollback completo em todas as falhas.

## Isolamento obrigatório antes de executar qualquer teste funcional

1. **Supabase**: instância/projeto próprio de homologação, completamente separado de `evolucao-orcamentos` (`zffpvykekwrmkbyjsgbh`) e `financas-pessoais-prod` (`xroqbwotijjxrksxfkfp`). Confirmar URL/ref visualmente e verificar migrations até 19T; nenhum comando de escrita no Supabase de produção.
2. **Identidades**: criar dois usuários sintéticos distintos (A com acesso `hub_os`, B com/sem acesso conforme caso); jamais usar uma sessão real de funcionário ou credenciais de produção.
3. **OS**: criar uma OS de teste marcada `19U-SANDBOX` e dados fictícios; fotografar baseline de status, pagamentos e eventos. Não tocar em OS de cliente.
4. **R2**: bucket/credenciais estritamente de teste para uploads reais. Para simulação de falha, usar adaptador/proxy de teste; nunca manipular o R2 de produção. Verificar limpeza de objetos de teste ao concluir.
5. **SMB**: agente/destino de teste separados para validar `service_role`, sem envio de arquivo a pastas reais de clientes.
6. **Execução**: rodar cenário por cenário no aplicativo apontado ao sandbox, pelo caminho real PostgREST/Edge Functions. Não substituir os testes de autorização por conexão SQL `postgres`/`service_role`: ela ignora RLS de usuários. Capturar resultado, identificador sintético e antes/depois; ocultar JWT, URLs pré-assinadas e segredos.
7. **Critério fail-closed**: se qualquer isolamento, permissão ou fixture faltar, registrar **BLOQUEADO**, sem executar cenário de escrita.

## Matriz de aceite funcional

| Caso | Ação em sandbox | Resultado obrigatório |
| --- | --- | --- |
| 19U-01 | A cria comprovante PENDING sem anexo | Proprietário/timestamp atribuídos pelo backend; storage `r2`, valores financeiros corretos, metadados vazios |
| 19U-02 | Falha de presign ou PUT antes do upload | Registro PENDING recém-criado removido pelo rollback legítimo; nenhum `PAYMENT_SUBMITTED`; OS permanece inalterada |
| 19U-03 | A faz primeiro upload e associa metadados | PUT conclui; um único UPDATE inicial grava key/ETag/tipo/tamanho, sem alterar valor/método/status/autor |
| 19U-04 | A conclui pagamento **sem** arquivo | Cria evento `PAYMENT_SUBMITTED` vinculado ao ID e bloqueia depois edição e exclusão do comprovante |
| 19U-05 | A tenta modificar `method`, `amount`, `received_date`, `installments`, `cadastro_completo`, `status`, `storage_provider` | Cada campo é rejeitado; após cada tentativa, banco preserva valores, status e contagens |
| 19U-06 | A tenta reescrever, remover ou substituir anexo já registrado | UPDATE negado; anexo, provenance e evento continuam íntegros |
| 19U-07 | B tenta editar/excluir registro de A | RLS nega operação; nenhuma linha alterada; testar usuários com acesso de módulo e sem acesso |
| 19U-08 | A tenta excluir comprovante anexado, enviado ou PENDING antigo | DELETE negado; cleanup permitido apenas para o próprio PENDING, sem metadados, não submetido e dentro da janela 19S |
| 19U-09 | Agente de teste usa `service_role` para atualizar `synced_to_smb_at`/`smb_path` | Sincronização técnica funciona sem abrir permissão de edição aos usuários autenticados; comparar metadados e eventos |
| 19U-10 | PUT R2 funciona, mas UPDATE de metadados falha | Detectar e documentar objeto órfão/registro PENDING; **não considerar aprovado** sem estratégia de reconciliação/limpeza |
| 19U-11 | Status da OS é atualizado, mas INSERT de `PAYMENT_SUBMITTED` falha | Detectar e documentar status/evento divergentes; **não considerar aprovado** sem correção ou reconciliação atestada |
| 19U-12 | A reabre/download de anexo válido via presign; B sem escopo tenta acessar a mesma key | A recebe conteúdo esperado; B sem autorização recebe 403; URLs assinadas nunca entram em logs/evidências |
| 19U-13 | Roda envio simultâneo/duplo clique no aplicativo de teste | Não há comprovantes ou eventos duplicados; capturar evidência da proteção ou abrir defeito |

**Importante:** a matriz acima é o roteiro a executar; não constitui evidência de testes realizados.

## Riscos observados na leitura do frontend

**R1 — órfão no R2:** `uploadedKey` é definido assim que o PUT tem sucesso; caso `updatePaymentProof` falhe, o `catch` não apaga o arquivo remoto nem elimina o PENDING. Um arquivo pode ficar órfão ou sem referência completa. Requer reprodução no sandbox e possível etapa corretiva posterior.

**R2 — inconsistência status/evento:** `updateOs(payment_status)` acontece antes de `createOsEvent(PAYMENT_SUBMITTED)`. Se a segunda operação falhar, o status da OS pode estar atualizado sem evento e o pagamento fica em estado intermediário. Requer reprodução e política de reconciliação/atomicidade.

**R3 — pós-evento sem anexo:** a 19T usa existência de `PAYMENT_SUBMITTED` para imutabilidade, mas é preciso testar o comportamento real através de RLS/JWT. Testes estáticos da migration, isolados, não demonstram esse cenário.

## Evidências mínimas para encerrar a 19U

- Identificação do projeto sandbox (sem credenciais), versões aplicadas e confirmação de R2/SMB isolados.
- Execução dos 13 casos com PASS/FAIL/BLOQUEADO, hora, ator sintético, ação, retorno HTTP/SQLSTATE quando aplicável, estados antes/depois e link para log sanitizado.
- Asserções de ausência de mutações em produção, incluindo snapshot somente-leitura de contagens de comprovantes, eventos e guardas. Não registrar ou expor dados pessoais, tokens ou presigned URLs.
- Lista de defeitos com prioridade e plano de correção. **19U não deve ser marcada como concluída** enquanto R1/R2 permanecerem sem resolução/mitigação aprovada.
- Após aprovação formal da homologação, solicitar autorização específica para qualquer ajuste de runtime/migration e, separadamente, para merge. Nunca disparar deploy manual.

## Escopo desta preparação

O teste `api/_shared/security/phase-19u-payment-submission-readiness.test.ts` é uma **verificação estática de contrato** do fluxo existente; roda em CI sem rede/credenciais/banco e não conta como homologação funcional. Nenhum deploy, merge, migração ou teste com dados de produção é autorizado por esta documentação.
