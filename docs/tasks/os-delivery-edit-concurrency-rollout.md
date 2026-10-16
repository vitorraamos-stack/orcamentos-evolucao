# EvoluSystem — Proteção de concorrência da edição de Entregas

## Diagnóstico (Supabase produção, somente leitura)
- `os_deliveries.updated_at` é obrigatório e atualizado explicitamente pelas funções atuais de editar/iniciar/concluir/cancelar. Não foi observado trigger automático na tabela.
- `hub_os_update_delivery_secure` verifica as permissões via `hub_os_assert_logistics_actor('DELIVERY')`, estados editáveis e responsável; atualiza detalhes e audita o evento.
- A Central de Entregas atualmente envia detalhes sem versão, permitindo que uma edição antiga sobrescreva uma mais recente.
- O formulário de edição não apresentava feedback próprio em caso de erro; o clique async poderia rejeitar sem tratamento no componente.

## Proposta (ainda não instalada)
- Uma nova RPC `hub_os_update_delivery_if_current` confere permissão, bloqueia a entrega, compara `updated_at` exato e delega o update/auditoria à RPC protegida atual, tudo numa transação.
- O repositório envia a revisão originalmente capturada da entrega, sem fallback para a função sem controle.
- O diálogo mantém os campos digitados e mostra erro inline quando salvar falhar; bloqueia fechamento durante a gravação, mas permanece aberto após rejeição.
- Preserva agendamento de nova entrega, ações de iniciar/concluir/cancelar, retirada, painel de OS, notificações e regras de estado.

## Implantação separada
1. **Não fazer merge do frontend antes de aplicar a nova função no banco.**
2. Solicitar autorização específica para aplicar apenas a RPC SQL em `docs/tasks/os-delivery-edit-concurrency-proposed.sql` ao projeto de produção `evolucao-orcamentos`.
3. Validar no Supabase grants (anon false, authenticated true), `search_path` vazio, bloqueio, comparação, delegação e avisos de segurança. Registrar migration com versão real.
4. Sincronizar migration no GitHub em um commit, revisar CI/Preview. Solicitar autorização de merge.
5. Após produção READY, uma homologação autenticada multiusuário ainda será necessária. Nenhuma OS real será alterada pelos testes automatizados.

## Limitações
- Protege **edição de detalhes**; não protege transições de status, criação de nova entrega nem escritores antigos que não atualizem `updated_at`.
- Atualizações via outras telas podem ser percebidas apenas após recarregar a Central de Entregas; a tentativa com revisão antiga será rejeitada.
- Alguns dados de testes legados não incluem `updated_at`. A propriedade permanece opcional no tipo e o repositório exige uma data ISO antes de chamar a RPC (falha fechada).
- Evitar commits intermediários para preservar a quota de deploys da Vercel.
