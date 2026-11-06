# Etapa 4 — Implementação estrutural preparada, NÃO aplicada

**Situação:** código e migrations adicionados ao PR #555, ainda em rascunho. Não houve execução de SQL no Supabase, aplicação de migrations, merge, Preview ou publicação. As Etapas 1 a 3 continuam em produção.

## Artefatos versionados

| Arquivo | Conteúdo | Aplicado? |
| --- | --- | --- |
| \`supabase/migrations/20261106150000_dashboard_etapa4_foundation.sql\` | 9 tabelas, índices, constraints, RLS, grants explícitos, log imutável | Não |
| \`supabase/migrations/20261106150500_dashboard_etapa4_rules_calendar_rpc.sql\` | Validação das exigências, prévia de impacto, publicação de regras com revisão otimista, calendário/versionamento/turnos/feriados | Não |
| \`supabase/migrations/20261106151000_dashboard_etapa4_dependency_rpc.sql\` | Criar/remover dependências via RPC gerencial, validar mesma OS/ativos, detectar ciclos, lock por OS, remover vínculos inválidos auditadamente | Não |
| \`supabase/tests/dashboard_etapa4_security_contract.sql\` | 24 asserções pgTAP de estruturas, RLS, grants e RPCs, para banco de testes | Não executado |
| \`src/modules/dashboard/dashboardStructuralMigrations.test.ts\` | Testes *estáticos* de proteção de migrações no CI | Sim, quando o CI executar |
| \`src/modules/dashboard/dashboardAdvanced.ts\` e leitor | Corrige \`retirada\`, mapeamento restritivo de escopos e distinção entre schema inexistente e erro PostgREST | Validado via testes frontend |

O arquivo \`docs/tasks/dashboard-operacional-etapa4-ddl-rascunho.sql\` continua como **referência bloqueada**, fora das migrations. Não deve ser executado.

## Limites reais da entrega

1. As migrations estão prontas **para revisão e execução posterior em homologação**, não certificadas em PostgreSQL. Passar no TypeScript/Vitest não valida sintaxe SQL, grants reais, execução das RPCs ou ausência de deadlocks.
2. **Nenhuma linha inicial** é criada em regras, calendários, vínculos ou intervalos/pausas. Após aplicar o esquema, essas fontes continuarão vazias até publicações autorizadas.
3. \`dashboard_publish_calendar\` publica versões com jornada/feriados explicitamente informados; não assume horário comercial, folgas nem feriados brasileiros. O fuso da operação é \`America/Sao_Paulo\`.
4. \`dashboard_publish_rule\` exige gestor/admin do Hub OS, justificativa, revisão esperada e calendário publicado para limites de tempo. O leitor não calcula gargalo temporal enquanto não existir trilha confiável de entrada/saída e pausas.
5. \`dashboard_link_operations\` e \`dashboard_unlink_operations\` exigem gestor/admin, validam vínculos de atividades ativas da mesma OS, trava transacional, ciclo completo via CTE e log de criação/remoção. Triggers de limpeza auditam cancelamento, exclusão lógica ou física e alterações de vínculo de item. A homologação precisa testar concorrência com as RPCs operacionais existentes.
6. **Persistência de intervalos de etapa e pausas** está modelada, com leitura protegida, mas a escrita/instrumentação por eventos do fluxo atual ainda não está conectada. O cálculo de permanência permanece indisponível (e não deve ser estimado).
7. A interface administrativa **Configurações → Regras Operacionais**, a tela de edição de dependências e o pré-cálculo de impacto por OS ainda dependem de implementação de frontend/API e autorização de acesso aos ambientes de testes.
8. No banco, os setores de responsáveis e prazos não são idênticos: \`APPROVAL\` não possui responsável próprio; \`LOGISTICS\` não possui responsável/prazo próprio. Regra com exigência não verificável é recusada por constraint e RPC. \`retirada\`, \`entrega\` e \`instalacao\` são aceitos como condição.

## Homologação obrigatória antes de qualquer aplicação de produção

- Criar/identificar **banco isolado e ativo** autorizado pelo usuário, nunca aplicar no projeto \`evolucao-orcamentos\` de produção durante esta fase.
- Rodar migrations do projeto em ordem no banco de testes, verificando erros, PostgREST Data API, grant e RLS.
- Rodar \`supabase/tests/dashboard_etapa4_security_contract.sql\` em ambiente com pgTAP.
- Preparar fixtures transacionais usando usuários anon, sem Hub, operador e gerente/admin. Demonstrar rejeição de acesso direto e RPC negada a não gestores, incluindo perfis desconectados.
- Exercitar regras condicionais (incluindo retirada), rejeição de escopos incompatíveis, revisões concorrentes, calendário sem turnos/sobreposto, exceções inválidas, mutação da auditoria e publicação sem justificativa.
- Validar bloqueio de auto-referência, relação cruzada entre OS, predecessor excluído/cancelado, duplicatas, caminho A→B→C→A, edição concorrente, exclusão/soft-delete de item e operação, exclusão de OS, rollback integral em erros e integridade do histórico.
- Confirmar **sem regressão** nas RPCs atuais de movimentação da OS e operações de produção; não alterar vendas/financeiro.
- Testar contratos do leitor já existente com os dados publicados e dados ausentes: nunca declarar materiais, gargalos ou dependências como comprovados sem dados.
- Somente após resultados confiáveis, solicitar autorização para aplicar em ambiente de homologação e, em decisão separada, para produção. Aplicar o esquema antes de liberar UI que dependa dele; ter plano de backup, janela e rollback revisado.

## Critérios de aceite desta subetapa

- Branch isolada e PR em rascunho: **sim**.
- Migrations + RPCs + contratos de auditoria criados no repositório: **sim**.
- Verificação estática no CI: **em execução/conforme resultado do PR**.
- Execução SQL em banco real e pgTAP comportamental: **não efetuadas**.
- Migrations aplicadas, merge ou publicação: **não autorizados e não efetuados**.
