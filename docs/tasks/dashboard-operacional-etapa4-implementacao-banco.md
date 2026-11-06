# Etapa 4 — Estrutura de banco aplicada em produção

**Situação em 06/11/2026:** as três migrations foram aplicadas com sucesso diretamente no projeto Supabase de produção \`evolucao-orcamentos\`. Não foi criado projeto, branch ou banco de testes. O PR #555 permanece em rascunho, sem merge; não houve deploy do frontend.

## Migrations aplicadas

| Migration | Versão registrada no Supabase | Conteúdo | Status |
| --- | --- | --- | --- |
| \`dashboard_etapa4_foundation\` | \`20261106181834\` | 9 tabelas, índices, constraints, RLS, privilégios e histórico imutável | Aplicada |
| \`dashboard_etapa4_rules_calendar_rpc\` | \`20261106181837\` | Prévia e publicação gerencial de regras, calendário, turnos e exceções | Aplicada |
| \`dashboard_etapa4_dependency_rpc\` | \`20261106181942\` | Criação/remoção de dependências, prevenção de ciclos e limpeza auditada | Aplicada |

## Verificações realizadas em produção

- CI do PR: \`npm run check\`, testes, \`npm run build:app\` e \`npm run verify:prod\` aprovados no commit \`c4ce21f62a4eb81955222b1ed06d811e9209d9c9\`.
- As nove tabelas novas existem e estão com RLS habilitado; cada uma tem política de leitura explícita.
- Privilégios confirmados: \`anon\` sem acesso; \`authenticated\` somente leitura direta; \`service_role\` sem acesso direto. As cinco RPCs públicas exigem validação de gestor do Hub OS; funções internas não são executáveis pelos papéis de API.
- Prévia consultiva chamada em contexto de gestor autenticado, com resposta válida.
- Publicação de um calendário e de uma regra executada em transação de verificação e revertida integralmente (\`ROLLBACK\`).
- Chamada da prévia por identidade sem perfil de gestor foi recusada.
- Após o rollback, todas as tabelas novas continuam com **zero registros**. Nenhuma regra, jornada, feriado, pausa ou dependência foi publicada.
- Os três gatilhos de limpeza e os cinco gatilhos de imutabilidade estão instalados.
- Advisor não identificou novas tabelas com RLS sem política. Os avisos preexistentes de outras tabelas/extension continuam. As cinco RPCs gerenciais aparecem no aviso genérico de \`SECURITY DEFINER\`, mas verificam módulo e perfil de gestor no servidor antes de executar.

## Limites e pendências

1. Não foi executado o arquivo pgTAP \`supabase/tests/dashboard_etapa4_security_contract.sql\`. Não foi criado ambiente de testes, conforme orientação do usuário. A validação real de concorrência, ciclos e falhas transacionais permanece limitada.
2. A produção atualmente não tem registros de operações em \`os_order_item_operations\`; por isso, o caminho de criação/remoção de dependências não foi exercitado com atividades reais. Nenhuma fixture foi inserida na OS existente.
3. \`dashboard_publish_calendar\` exige jornada e exceções explicitamente informadas; não presume horário comercial, folgas nem feriados brasileiros. Fuso: \`America/Sao_Paulo\`.
4. \`dashboard_publish_rule\` exige gestor/admin do Hub OS, justificativa, revisão esperada e calendário publicado para limites de tempo. Nenhuma regra está publicada.
5. \`dashboard_stage_intervals\` e \`dashboard_stage_pauses\` estão modeladas e protegidas, mas ainda não recebem eventos automaticamente. Permanência/gargalo temporal não deve ser calculado ou exibido como confirmado.
6. A interface **Configurações → Regras Operacionais**, a edição visual de dependências e a integração de eventos de entrada/saída/pausas ainda precisam ser implementadas.
7. \`APPROVAL\` não possui responsável próprio e \`LOGISTICS\` não possui fonte própria de responsável/prazo. As RPCs recusam exigências não verificáveis. Condições logísticas aceitas: \`retirada\`, \`entrega\`, \`instalacao\`.
8. A preparação de materiais continua sem reserva física vinculada à agenda. Não declarar materiais confirmados sem uma fonte real.

## Estado de publicação

- Banco de produção: **migrations aplicadas; tabelas vazias e protegidas**.
- PR #555: **draft, sem merge**.
- Frontend/Preview/produção Vercel: **inalterados**.
- Etapas 1, 2 e 3: continuam como estavam; nenhum código novo da Etapa 4 foi publicado.
- Próximo trabalho: implementar UI administrativa e conectar eventos de operações/pausas, preservando a regra de que nenhum calendário ou exigência operacional é presumido.
