# Dashboard Operacional — novas regras — Etapa 1 / incremento inicial

**Situação:** implementação em branch isolada, sem merge, migrations aplicadas ou publicação Vercel. Complementa as Decisões 01–39, sem substituí-las.

## Implementação deste incremento

- `dashboardOperationalPolicy.ts`: proposta da jornada aprovada (segunda a sexta, 08:00–12:00 e 13:12–18:00), nunca publicada automaticamente.
- Recorte **verificado e restrito a 2026** dos feriados nacionais, estaduais de SC e municipais de São José; pontos facultativos não encerram o expediente privado por presunção.
- Prévia pura com precedência: exceção autorizada por setor > exceção geral autorizada > feriado legal > jornada específica do setor > jornada padrão.
- Bloqueio conservador de exceções não autorizadas, conflito de horário e dados inválidos.
- Avaliação pura de dois limites de permanência **total útil**: Atenção e Crítico, sem inventar criticidade, tempo nem a causa do atraso.
- Testes unitários para jornada, feriados, pontos facultativos, precedência, exceções e limites.

## Pendências para concluir a Etapa 1

- Persistência e publicação auditada dos limites duplos por setor em migrations/RPC novas, **não executadas em produção**.
- Persistência de calendário padrão, complementos setoriais, feriados e exceções autorizadas, com revisão da regra de versões abertas sem data final.
- Interface para prévia completa, configuração por gestores, sugestão dos supervisores, aprovação de mudanças retroativas e histórico.
- Adaptar `dashboardAdvanced.ts` para confrontar os limites publicados com **permanência total**, preservando execução e espera separadas nas próximas etapas.
- Integrar a lista de observâncias ao fluxo de revisão/publicação; **a lista ainda não modifica cálculos das OS**.
- Validar legalmente calendários de **2027 em diante** com fontes oficiais específicas, sem reproduzir 2026 automaticamente.
- Executar `npm run check`, `npm run test`, `npm run build` em CI habilitado antes de qualquer merge.

## Fontes oficiais do recorte 2026

- Município São José: Decreto 23.649/2025 — https://saojose.sc.gov.br/wp-content/uploads/2026/03/Decreto_23649_2025-feriados_municipais_e_ponto_facultativo__calendrio_2026.pdf
- Estado SC: Decreto 1.374/2026, Lei 18.531/2022 (Data Magna transferida para domingo) — https://leis.alesc.sc.gov.br/ato-normativo/53811
- Federal: calendário nacional 2026, informações do Ministério da Gestão — https://agenciagov.ebc.com.br/noticias/202512/confira-o-calendario-oficial-de-feriados-nacionais-e-pontos-facultativos-em-2026

**Importante:** decretos de expediente público não autorizam inferir pontos facultativos como dias sem expediente de uma empresa privada. A gestão deverá confirmar/registrar exceções.

**Controle de deploy:** a branch mantém o Vercel desabilitado via `vercel.json`. A entrada deverá ser removida somente em uma revisão expressamente autorizada, antes de eventual merge para main.

## Segundo incremento (09/11/2026) — integração parcial

- Migration proposta `20261109115000_dashboard_operational_thresholds_stage1.sql`: novas tabelas de limites Atenção/Crítico por setor, histórico imutável, RLS, prévia e publicação com autorização da gestão, revisão otimista e auditoria. **Migration não aplicada no Supabase.**
- Novo painel administrativo `DashboardThresholdsPanel.tsx`, integrado à página Regras Operacionais. Há confirmação explícita, prévia conservadora e histórico de revisões.
- O calendário existente recebeu ações para **sugerir** a jornada de 44h e feriados legais de 2026 dentro da vigência informada. Nada é publicado sem confirmação gerencial. Pontos facultativos não são adicionados como folgas automáticas.
- `dashboardAdvanced.ts` agora separa permanência útil total, espera comprovada e tempo não bloqueado. A criticidade Atenção/Crítico é avaliada sobre a permanência **total** usando somente evidência válida e limites vigentes desde a entrada na etapa.
- `dashboardAdvancedRepository.ts` recupera limites apenas publicados; a ausência da nova tabela, antes da migration, é apresentada como indisponibilidade, não como zero alertas.
- Testes para regras puras, RPCs, contrato de migration e integração do cálculo, sem alterar a produção.

### Restrições e trabalho restante

- **A Etapa 1 ainda não está concluída**: falta persistência de exceções/calendários setoriais (além do calendário global legado), mecanismo versionado de substituição de vigência aberta, supervisores consultando e sugerindo ajustes, fluxo formal de correção retroativa, e simulação de impacto de alertas com durações verificadas.
- A prévia de limites no Supabase mostra OS e **intervalos candidatos**; não informa quantidade prevista de alertas Atenção/Crítico enquanto não houver cálculo completo verificável. A interface explicita essa limitação.
- A migration proposta só foi revisada estaticamente. Nenhuma rotina pgTAP/concorrência/segurança foi executada em banco de teste ou produção.
- O cálculo de 'tempo útil não bloqueado' **não comprova execução efetiva**; é apenas permanência descontadas pausas comprovadas.
- A função `dashboardAdvanced.ts` ainda depende de regras/calendários legados e histórico confiável para liberar durações. Nenhum valor foi retroprojetado.
- **Não realizar merge, não executar migrations e não publicar em Vercel** sem nova autorização específica. A branch mantém o deploy automático desativado.


## Terceiro incremento (09/11/2026) — calendário setorial versionado

- `dashboardSectorCalendar.ts`: resolução determinística e conservadora de versões setoriais por data, preservando dias anteriores e evitando reativar uma revisão vencida após nova versão.
- Herança: quando não existe jornada própria, o setor usa a jornada geral. A ordem de precedência é **exceção setorial autorizada > exceção do calendário geral/feriado > jornada setorial > jornada geral**. Uma jornada setorial semanal NÃO ignora feriados automaticamente.
- Revisões específicas por setor com vigência, modo de herança ou substituição dos turnos, e exceções com até seis intervalos no mesmo dia, inclusive folga integral ou plantão autorizado.
- `DashboardSectorCalendarsPanel.tsx`: editor administrativo integrado à aba **Por setor** em Regras Operacionais, com histórico, justificativa, prévia ilustrativa dos horários, confirmação antes da publicação e bloqueio se o schema não estiver instalado.
- `dashboardSectorCalendarRepository.ts`: leitura completa com contagem exata e publicação somente pela RPC de gestão, sem escrita direta em tabelas.
- `dashboardAdvanced.ts`: interseção de tempos úteis e pausas passa a considerar a versão setorial vigente em cada data, sem reescrever durações históricas.
- Migration **proposta, não aplicada**: `20261109120500_dashboard_sector_calendars_stage1.sql`, com RLS, revisões imutáveis, validação de horários, revision lock e vigência presente/futura (sem retroatividade silenciosa).
- Testes unitários, integração temporal, contrato estático de segurança e cliente RPC adicionados.

### Limitações antes de produção

- A migration não foi executada em banco real. Falta teste de execução SQL e permissões autenticadas; contrato estático e CI não substituem validação real.
- A prévia no editor cobre a primeira semana e datas de exceções relevantes, não uma simulação integral de todas as OS atingidas.
- O calendário **geral** antigo ainda não permite substituição auditada de versão com vigência em aberto. Esse fluxo requer revisão separada antes de ativar novas regras operacionais.
- A nomenclatura de supervisor e um canal de sugestões não estão modelados nas permissões atuais; não presumir que todo colaborador do setor seja supervisor.
- Correções retroativas com impacto calculado e auditoria específica continuam pendentes.
- Não existem publicações fictícias de calendários, limites ou feriados.
- O botão de publicação depende de autorização gerencial dentro do aplicativo após aplicação futura da migration; o merge/execução da migration/publicação Vercel continuam sem autorização.


## Quarto incremento (09/11/2026) — sucessão global e solicitação retroativa

- \`dashboardCalendarTimeline.ts\`: determina a versão geral em vigor para **cada data**, sem reabrir versões superadas nem considerar dias de lacuna como trabalhados. O término *efetivo* de uma versão aberta é o dia anterior ao início da próxima.
- \`calculateWorkingMinutes\`: uma OS que permanece na mesma etapa durante a troca de calendário passa a ser avaliada dia a dia com a versão correta e seus respectivos feriados; não reescreve o calendário vinculado à entrada da OS. Evidência de entrada desatualizada permanece sinalizada como insuficiente.
- Consulta das versões globais, turnos e exceções com paginação de contagem exata, para não calcular sobre histórico incompleto.
- Migration PROPOSTA \`20261109131500_dashboard_calendar_successions_stage1.sql\`: nova RPC de sucessão **prospectiva**, com prévia consultiva, auditoria imutável e bloqueio de inserções retroativas também na RPC antiga. O registro da versão anterior nunca é atualizado nem removido.
- A página administrativa oferece prévia de vigência, indicação de intervalos e regras potencialmente afetadas, confirmação antes da publicação e histórico com término efetivo de cada versão. A prévia **não afirma** quantos minutos/alertas mudarão sem evidência completa.
- Migration PROPOSTA \`20261109134000_dashboard_calendar_retro_requests_stage1.sql\`: consulta e registro **imutável de solicitações** para corrigir um único dia anterior, com justificativa, versão histórica, prévia de intervalos candidatos e identificação do gestor. O novo painel administrativo permite registrar a solicitação **sem aplicar** nenhum ajuste retroativo.
- Testes de sucessão, lacunas, histórico, novas RPCs e limites de segurança foram adicionados. Ambas as migrations permanecem não aplicadas.

### Pendências críticas

1. **Aprovação e aplicação retroativa real ainda NÃO estão implementadas**. Solicitações permanecem \`pending_review\` e não alteram calendários, horas, indicadores, alertas ou OS; a aplicação exigirá nova decisão técnica, simulação comprovável de impacto e autorização específica.
2. A nova RPC global não republica automaticamente regras vinculadas à versão anterior. A gestão deve revisar regras e limiares; avaliações sem evidência completa permanecem indisponíveis.
3. A prévia de impacto global e retroativa informa vínculos/candidatos, não diferença verificada de horas nem alertas.
4. Há migrations de calendário e limites ainda não aplicadas; a migração precisa ser verificada em banco apropriado (RLS, grants, triggers, concorrência e segurança) antes de produção.
5. Supervisores ainda não possuem papel operacional independente nem fluxo próprio de sugestões.
6. Antes de merge, atualizar a branch conforme mudanças recentes na \`main\` e validar eventuais conflitos. Não publicar automaticamente por Git/Vercel.

## Quinto incremento (09/11/2026) — integridade e revisão gerencial

- Histórico completo das solicitações retroativas em páginas com contagem exata; páginas incompletas não são apresentadas como histórico integral.
- Nova migration PROPOSTA `20261109142500_dashboard_calendar_retro_review_triage_stage1.sql`, ainda não aplicada, para pareceres gerenciais imutáveis (`needs_evidence` ou `rejected`) e simulação do expediente do calendário geral em uma data.
- A prévia compara minutos **planejados no calendário geral** antes e depois da proposta, contando intervalos candidatos e identificando vínculos setoriais e limites para revisão. **Não calcula impacto comprovado nas OS ou mudança em alertas.**
- A interface permite registrar necessidade de evidências adicionais e rejeitar uma solicitação, com justificativa e auditoria. Não há função de aprovar ou aplicar a correção.
- Uma solicitação rejeitada pode ser substituída por outra, sem alterar ou excluir o registro histórico. Reenvio e rejeição usam bloqueio transacional por calendário e data.
- Correção de delimitadores SQL na migration de sucessão global, identificada antes da aplicação.
- Testes de contrato essenciais foram adicionados; validação real de SQL, RLS, concorrência, simulação completa por OS e compatibilidade com `main` continuam necessárias antes de qualquer implantação em produção.

**Proibido aplicar, fazer merge ou publicar sem autorização específica.** As migrations e os pareceres são somente código proposto na branch.
