# EvoluSystem — concorrência de Responsáveis e Prazos

**Situação: proposta. Nenhuma SQL deste documento foi aplicada em produção.**

## Diagnóstico somente de leitura
- `public.os_order_assignees` e `public.os_order_deadlines` possuem `updated_at` com trigger `BEFORE UPDATE`.
- Cada tabela possui `UNIQUE(order_id,scope)`, mas a ausência de um registro não equivale a versão imutável.
- A UI hoje executa `upsert` e remoção sem controlar versão, com registros de auditoria realizados em requisições separadas.
- Responsáveis: `GENERAL`, `ART`, `PRODUCTION`, `FINISHING`, `INSTALLATION`.
- Metas internas exibidas no Resumo: `ART`, `PRODUCTION`, `FINISHING`; `APPROVAL` e `INSTALLATION` existem no domínio mas não foram adicionados à UI.
- RLS continua habilitada nas tabelas de gestão. Não modificar grants nem policies nesta etapa.

## Plano de implantação (banco PRIMEIRO, UI DEPOIS)
1. **Solicitar autorização específica** para a aplicação do SQL em `docs/tasks/os-management-concurrency-proposed.sql` no projeto Supabase da Evolução.
2. Gerar arquivo de migration via CLI, quando disponível, e aplicar como migration registrada. Incluir o arquivo versionado no PR após aplicação.
3. As duas RPCs **adicionais**, `hub_os_set_assignee_if_current` e `hub_os_set_deadline_if_current`, validam módulo e papel gerencial antes de bloquear a OS, com `search_path` seguro e grants explícitos apenas para `authenticated`.
4. A transação bloqueia a linha-pai da OS, depois a linha de cada escopo (se existir), verifica a versão original (inclusive ausência), realiza a alteração e grava o evento de auditoria atomicamente. Em conflito, transação aborta sem alteração/auditoria.
5. Verificar por consultas **somente de leitura**: assinaturas, grants, triggers, legacy RPCs intactas, histórico da migration e advisors de segurança. As novas `SECURITY DEFINER` poderão receber avisos sobre EXECUTE para authenticated; este acesso deve ser intencionalmente revisado.
6. Revalidar testes e Vercel Preview da branch. **Não executar merge sem autorização específica do PR**.
7. Após o merge, verificar publicação automática sem deploy manual e testar com dois usuários autenticados em homologação controlada, incluindo escopos ausentes, concorrência de alterações, remoções e histórico.

## Escopo e limitações
- Não alterar prazo contratado/dados gerais da OS. Responsáveis e metas continuam exclusivamente em **Resumo**.
- A UI substitui suas próprias gravações diretas pelas novas RPCs. **Outros consumidores legados que ainda gravarem diretamente nas tabelas podem contornar a verificação de versão**, especialmente nas criações quando o registro ainda não existe; migrar esses consumidores em etapa posterior. O SQL não promete isolamento global contra escritores legados.
- Se a nova RPC estiver indisponível, a UI falha **fechada**: não usar métodos sem trava.
- Se houver conflito, a escolha não é gravada. Responsável recebe aviso mantendo o valor anterior; data digitada permanece no campo até correção.
- Auditoria dos eventos `assignee_changed`, `deadline_changed`, `deadline_completed`, `deadline_reopened`, `deadline_removed` passa a ocorrer no servidor, dentro da transação, **somente para estes novos fluxos**.
- Testes unitários com mocks não equivalem à homologação autenticada.
