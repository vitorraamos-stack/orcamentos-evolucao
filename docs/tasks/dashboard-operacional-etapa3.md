# Dashboard operacional — Etapa 3 (Preparação operacional)

**Base:** decisões do Dashboard 01–44 (decisões 33, 34, 38–40 e 42 nesta entrega). Etapas 1 e 2 preservadas na main. Implementação somente na branch isolada.

## Comportamentos implementados

- Preparação **por compromisso e por OS**, calculada a partir de itens existentes em os_order_items, operações de os_order_item_operations e da marcação operacional de insumos na OS. Atividades obrigatórias/ opcionais distintas, status cancelado excluído, operações bloqueadas e não atribuídas reportadas.
- Avaliação individual de cada item e da conclusão das operações obrigatórias. Trabalho paralelo pode existir em centros distintos, mas **não são inferidas dependências** ou caminhos críticos (Etapa 4).
- Separação estrita de **produção** (pronta/parcial/pendente/não verificada) e **materiais** (pendentes ou não verificados); consolidação consultiva nunca afirma prontidão total sem comprovação de materiais daquele compromisso.
- Em particular, **não foi encontrada tabela que vincule quantidades e disponibilidade de insumos físicos especificamente a cada compromisso**. Marcador PRONTO e operações concluídas não são evidência de material reservado. Tag AGUARDANDO_INSUMOS significa pendência explícita; demais registros permanecem como material *não verificado*. Sem falsos positivos de pronto, sem mexer em estoque, sem migrations.
- Agenda compacta e painel lateral mostram status da preparação, um alerta principal por compromisso e razões adicionais expandidas sob demanda. Antecedência configurável na interface (24/48/72h, padrão 48h, não persistida no servidor). Conflitos e atividades bloqueadas mantêm alertas existentes. Nenhuma alteração da agenda nem da OS é executada.
- Contagem de **OS distintas** na preparação (uma OS com prazo e instalação não infla os totais); compromissos preservam seus alertas individuais. Os cinco itens da lista de prioridades exibem rótulos de produção/material sem substituição da classificação de risco original.
- Busca de registros **apenas das OS visíveis na agenda ou no resumo prioritário**. Paginação integral, RLS existente, descartes de respostas antigas, falha isolada da leitura de preparação.
- Revalidação automática após alterações via Supabase Realtime: quando o evento identifica order_id/item_id, consulta **somente a OS afetada**; modificações de ordem, responsáveis e agendamento exigem recálculo da agenda e prioridades. Debounce 350 ms e atualização periódica de 120 segundos já existente garantem consistência.
- Responsividade, modo escuro, acessibilidade de detalhes e navegação direta para OS preservadas.

## Limites

- A prontidão de materiais permanecerá **não verificada** até que um sistema/tabela existente forneça vinculação e confirmação física por compromisso; esta etapa não cria dados fictícios ou fluxo de reserva.
- Os avisos por antecedência são configurados apenas para a sessão da tela, sem parametrização administrativa persistente.
- Dependências complexas, gargalos, permissões administrativas adicionais e demais pontos das decisões 15–20, 35–37, 41 e 43–44 continuam para Etapa 4.
- Não há nova escrita de banco, mudança de auth, migration, merge ou publicação. Preview automático da branch foi desabilitado por vercel.json; remover apenas mediante autorização de publicação.

## Validação

- npm run check, npm run test, npm run build:app e CI existente.
- Testar itens READY sem materiais comprovados, itens parcialmente prontos, operações obrigatórias bloqueadas e sem responsável, atividades paralelas, OS sem itens, compromissos duplicados por OS, horários próximos e atrasados, responsividade, perfil de acesso, mudança de usuário, atualizações concorrentes e erros de rede.
- Homologação visual com dados reais em Preview exige autorização separada antes de merge/publicação.
