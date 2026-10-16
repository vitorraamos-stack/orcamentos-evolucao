# EvoluSystem — Observações finais de Instalações (proteção de rascunho)

**Estado: proposta no GitHub. Supabase não modificado, sem merge ou deploy.**

## Problema confirmado
A tela `InstallationExecutionPage` carrega dados novamente quando há mudanças em checklist, evidência ou instalação (Realtime) e também após algumas ações locais. Cada carregamento substituía `notes` pelas observações do servidor, podendo perder texto ainda não salvo.

A RPC atual `hub_os_update_installation_completion_notes_secure` verifica executor/equipe/gerente, permite editar apenas em `IN_PROGRESS`, limita texto a 4.000 caracteres e atualiza `updated_at`. Porém, não compara a versão original recebida pelo operador, permitindo sobrescrita entre sessões.

## Solução proposta
- Preservar no navegador o texto editado durante recargas automáticas. Quando `updated_at` ou as observações do servidor mudarem enquanto há rascunho, marcar conflito, mostrar aviso e impedir gravação cega.
- Oferecer botão explícito **Descartar meu texto e usar versão atual**, mantendo as alterações locais até essa escolha.
- Bloquear salvamentos repetidos, manter o rascunho em erros e atualizar a revisão após gravação bem-sucedida. A mudança só atinge observações; checklist, evidências e conclusão mantêm o fluxo atual.
- Uma função aditiva `hub_os_update_installation_completion_notes_if_current` bloqueia a instalação, chama `hub_os_assert_installation_executor`, confere a revisão e delega a gravação à RPC existente, na mesma transação. Não altera schema de tabelas, grants legados ou RLS.

## Próximas etapas, mediante autorizações separadas
1. **Não integrar frontend na `main` antes de instalar a função proposta.**
2. Solicitar autorização específica para a função em `docs/tasks/os-installation-completion-notes-concurrency-proposed.sql`, no projeto `evolucao-orcamentos`.
3. Validar a migration real em banco: controle por função, versão, transação, RLS preservado, `anon=false`/`authenticated=true`, avisos de segurança; versionar migration exata no GitHub em **um único commit**.
4. Confirmar CI e pedir autorização separada para merge. Evitar Previews e deploys manuais para preservar quota Vercel.
5. Homologação funcional entre duas sessões autenticadas fica pendente conforme preferência do gestor; testes automatizados usam mocks, nunca OS reais.

## Limites conhecidos
A proteção aplica-se somente a **salvar observações finais**. Outros eventos podem mudar `updated_at` e bloquear conservadoramente uma edição anterior. Outros escritores que não atualizam `updated_at` não estão protegidos. Fechar ou atualizar completamente a página no navegador descarta o rascunho, pois ainda não há salvamento local persistente.
