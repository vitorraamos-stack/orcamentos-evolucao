# Minha Fila de Trabalho — V1

## Objetivo
Substituir a navegação cotidiana pelos quadros de Arte e Produção por uma visão individual de atividades, mantendo as transições canônicas, permissões e fluxos de upload.

## Navegação
- `/minha-fila` — tela inicial para perfis com acesso `hub_os`.
- Menu lateral e PWA: Minha Fila, Central de OS, Agenda e módulos autorizados.
- Os quadros de Arte e Produção saem da navegação e dos atalhos; **as rotas e serviços antigos permanecem no código por compatibilidade operacional**, até validação integral das operações antes da descontinuação definitiva.
- Dashboard Operacional de gestão permanece em `/hub-os`.

## Origem dos dados
- `os_order_assignees`: atribuições GENERAL (somente acompanhamento de aprovação), ART, PRODUCTION, FINISHING e INSTALLATION.
- `os_order_item_operations`: operações por item com `assigned_to` e status próprio. Operações concluídas são apresentadas no histórico dos últimos 30 dias.
- `os_installations`: instalações com responsável individual ou equipe da qual o usuário é integrante.
- `os_order_deadlines`: prazo da etapa; fallback `os_orders.delivery_date` sinalizado explicitamente como prazo final da OS.
- Dados das tabelas consultados com filtros de usuário e autorização RLS existente.

## Fluxos preservados
- Iniciar Arte, enviar para aprovação e retomar ajustes pela função `moveBoardOrder`, com verificação de transições no banco.
- Liberar para Produção **somente após upload obrigatório do layout final**, pela modal `ArtworkProductionLayoutDialog`.
- Operações produtivas iniciadas/concluídas pela RPC de mudança de status com controle otimista `updated_at`.
- Demais execuções abrem a OS, na aba correspondente, ou a execução da instalação.
- Atribuições não são alteradas pelo dashboard.
- Notificações Push não são habilitadas por esta alteração.

## Status e prazos
- A fazer, Em andamento, Aguardando, Bloqueada e Concluída.
- Atraso individual conta apenas prazos de etapa/instalação; atraso no prazo final da OS é sinalizado separadamente como **OS em risco**.
- Próximos prazos: até três dias úteis (sábados e domingos excluídos; feriados seguem regras de SLA existentes quando integradas).
- Priorização: atraso próprio, prazo próximo, OS em risco, prioridade alta, bloqueios e demais pendências.

## Cuidados de implantação
1. Executar TypeScript, Vitest e build.
2. Validar fluxos reais de Arte e Produção, especialmente liberação do layout, envio à aprovação, operações por item e encaminhamento após operações concluídas.
3. Validar permissões de consultora, arte-finalista, produtora, instalador e gestão, inclusive acesso direto por URL.
4. Conferir atribuições sem usuário (continuam visíveis à gestão via Central, mas não entram na fila pessoal) e mudanças em tempo real.
5. Só após a conferência é seguro redirecionar/remover as URLs e os componentes legados dos quadros.

Esta entrega **não** altera schema, políticas RLS nem dados reais. Não houve merge nem publicação.
