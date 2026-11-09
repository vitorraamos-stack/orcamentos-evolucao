# PR #556 — Plano de publicação controlada do Dashboard

Status em 09/11/2026: **preparação, sem autorização para alterar produção**.

## Diagnóstico confirmado
- Supabase de produção: `evolucao-orcamentos`. Base das OS, intervalos, pausas, regras e calendários já presente.
- Última migration remota registrada antes da revisão: `20261109153553_user_profile_avatars`.
- As sete migrations do PR #556 foram reordenadas com versões `20261109160001` a `20261109160007`, posteriores ao histórico remoto. Não houve aplicação das migrations nem alteração de dados em produção.
- `supabase/preflight/dashboard_operacional_release_readonly.sql` foi executado com sucesso, exclusivamente leitura: sem objetos-base faltantes e sem as novas tabelas parcialmente criadas.
- A triagem de correções retroativas continua **somente leitura**. `approval_allowed=false` e `application_allowed=false` não devem ser alterados na publicação.

## Ordem das migrations a aplicar, somente depois de autorização expressa
1. `20261109215154_dashboard_operational_thresholds_stage1.sql`: limites e histórico de revisão.
2. `20261109215212_dashboard_sector_calendars_stage1.sql`: regras de calendário por setor.
3. `20261109215223_dashboard_calendar_successions_stage1.sql`: sucessão global futura e auditoria.
4. `20261109215233_dashboard_calendar_retro_requests_stage1.sql`: solicitações retroativas.
5. `20261109215242_dashboard_calendar_retro_review_triage_stage1.sql`: pareceres gerenciais.
6. `20261109215251_dashboard_calendar_retro_candidates_stage1.sql`: descoberta de OS candidatas.
7. `20261109215301_dashboard_calendar_retro_approval_preflight_stage1.sql`: pré-validação, dossiês e simulações.

## Condições para liberar o merge e a publicação
- Confirmar que **CI geral e workflow do Dashboard** estão verdes para o mesmo HEAD do PR. Não aceitar checks antigos.
- Revisar o `supabase migration list --remote` e executar `supabase db push --remote --dry-run` a partir do mesmo commit, conferindo a lista exata; a versão CLI deve ser verificada com `--help`.
- Preservar um backup recuperável e documentar responsável, horário de janela e mecanismo de restauração, sem exportar senhas ou dados pessoais.
- Somente com autorização específica, aplicar as migrations na ordem listada, com histórico de versão consistente. Não usar editor SQL isolado fora do controle de migrations para simular aplicação.
- Confirmar RLS/EXECUTE gerencial, funções de leitura e resposta bloqueada para aprovação, e existência das novas tabelas. Se qualquer passo falhar, **interromper antes do merge**.
- Só então integrar PR #556 à `main`, deixar a Vercel gerar o deployment e confirmar o carregamento do Dashboard e das OS reais sem modificar dados operacionais.
- Em caso de falha de interface, voltar ao deployment anterior na Vercel; alterações de esquema são versionadas e **não devem ser desfeitas com DROP/DELETE improvisado**. Avaliar migration corretiva e restauração somente com plano aprovado.

## Limites da validação
- Não criar banco de testes, conforme decisão de gestão.
- Os testes de TypeScript e SQL **estáticos** não substituem verificação no Postgres e nas regras de permissão. A checagem somente leitura feita em produção confirma dependências, não comprova que as migrations novas executam sem erros.
- Dossiês de correções históricas podem registrar encaminhamentos, **não aprovações e nem alterações retroativas**.
- Não realizar merge, aplicar migration ou publicar como consequência automática da criação deste documento.
