# EvoluSystem — Checklist de Execução, concorrência e duplo clique

**Estado:** proposta. Nenhuma migration aplicada, nenhum merge ou deploy.

## Diagnóstico
- A tela da execução expõe múltiplos cliques no mesmo item antes da resposta do Supabase; não informa que o salvamento está em andamento.
- A RPC existente `hub_os_set_installation_checklist_item_secure` usa bloqueio de linha, checa as permissões do executor, regras de fase, N/A permitido e atualiza `updated_at`; porém, não compara a revisão vista quando o checklist abriu. Uma gravação mais antiga pode sobrescrever outra.
- A atualização de status envia `p_note=null` atualmente, o que pode apagar uma observação associada ao item.
- A tabela de checklist já possui `updated_at` obrigatório, sem precisar adicionar coluna.

## Mudanças propostas
- Uma nova RPC `hub_os_set_installation_checklist_item_if_current` recebe id, versão `updated_at`, status e observação. Bloqueia item **antes** da instalação (mesma ordem da RPC atual), verifica autorização do executor, compara versão e delega à função protegida existente na mesma transação. `anon` não terá acesso; somente `authenticated` com verificação interna.
- O frontend envia a versão original do item, mantém a observação preexistente, não faz fallback para a RPC legada e recarrega o checklist após êxito ou erro.
- A interface desabilita alterações enquanto o item é salvo, indica **Salvando…** e não permite iniciar/concluir a instalação com alteração de checklist em andamento. Sem novos menus ou campos.
- A página de consulta do checklist na OS continua somente leitura. Checklists de outras instalações não são modificados.

## Ordem e permissões
1. Validar CI do PR em rascunho; não efetuar merge.
2. Pedir autorização **separada** para aplicar exclusivamente o SQL `docs/tasks/os-installation-checklist-concurrency-proposed.sql` ao Supabase produção.
3. Validar grants, `search_path`, `FOR UPDATE`, checagem de executor, comparação de versão, delegação e avisos dos advisors; versionar migration aplicada no GitHub.
4. Revalidar CI e pedir autorização **separada** para merge. Não acionar deploy manual ou builds intermediários.
5. Homologação de concorrência entre duas sessões autenticadas continua pendente; nenhum teste automatizado modifica OS reais.

## Limitações
- Esta proteção cobre apenas **atualizações de status de itens do checklist** realizadas pela nova RPC; chamadas legadas ainda podem escrever sem comparação de versão.
- O estado em memória é atualizado via recarga; se vários itens forem editados concorrentemente por pessoas distintas, cada item verifica sua própria versão. Mudanças de status da instalação continuam sujeitas às validações da RPC protegida.
