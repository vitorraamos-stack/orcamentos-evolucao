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
