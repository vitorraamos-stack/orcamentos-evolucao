# Dashboard operacional — Etapa 4: inteligência avançada

**Base publicada:** Etapas 1–3; decisões 01–44 preservadas. A Etapa 4 permanece isolada na branch `feat/dashboard-inteligencia-avancada-etapa4-20261106` e no PR #555, ainda em rascunho. Nenhum frontend da Etapa 4 foi publicado.

## Estado atual

- As migrations de estrutura, regras/calendários e dependências foram aplicadas diretamente no Supabase de produção `evolucao-orcamentos` por orientação expressa. Não foi criado projeto, branch ou banco de testes.
- A interface administrativa **Configurações → Regras Operacionais** foi implementada na branch: regras por etapa, prévia de impacto, publicação auditada, histórico, calendário semanal e exceções.
- O painel **Gargalos e dependências** agora permite que gestores registrem e removam vínculos explícitos entre atividades da mesma OS. Inclusões e remoções passam pelas RPCs protegidas e exigem justificativa.
- A instrumentação de entrada/saída de etapa e pausas por operação bloqueada foi adicionada como migration. Ela não retroprojeta o histórico das OS antigas.
- CI, testes e build foram aprovados nos commits de implementação da interface e do editor de dependências. A validação final desta migration será registrada após a aplicação.

## Comportamento e limites de evidência

### Regras e calendário

- Não há jornada, feriado, exigência ou limite de tempo presumido.
- A primeira publicação de cada regra exige prévia de impacto, justificativa e revisão esperada.
- Calendários são versionados e imutáveis; intervalos sobrepostos e vigências conflitantes são recusados no servidor.
- Uma versão sem data final permanece aberta e impede a publicação de uma versão posterior até que sua vigência seja encerrada formalmente.
- Aprovação não tem fonte própria de responsável e Logística não tem fonte própria de responsável/prazo. A interface mantém essas exigências opcionais, conforme o contrato validado no banco.

### Dependências

- Só são registradas relações explicitamente definidas pelo gestor.
- O banco valida que ambas as atividades pertencem à mesma OS, estão ativas, são distintas e não criam ciclo.
- A interface não altera status, prioridade, ordem de produção ou prazo das atividades.
- A produção atual não possui atividades em `os_order_item_operations`; portanto, os controles de vínculo podem aparecer sem opções até que existam atividades reais.

### Eventos de etapa e pausas

- Novas OS passam a registrar o primeiro intervalo no momento de sua criação, quando o escopo é reconhecido.
- Para OS existentes sem histórico, a primeira atualização observada dentro da mesma etapa cria apenas um marco `unverified`; isso não afirma quando a etapa realmente começou e não pode alimentar cálculo de duração.
- Mudanças reais de etapa registram o fechamento do intervalo anterior e a abertura de outro `verified`.
- Uma operação que entra em `BLOCKED` registra uma pausa somente se houver intervalo de etapa aberto. A pausa termina ao sair do bloqueio, cancelar/excluir/mover o item ou mudar a etapa da OS.
- Eventos anteriores à instalação da instrumentação não são reconstruídos. Nenhuma linha histórica foi preenchida artificialmente.
- Mesmo com eventos `verified`, o cálculo de permanência/gargalo ainda precisa validar calendário vigente, intervalos completos e pausas. Até essa etapa, o Dashboard não deve apresentar duração como confirmada.

## Verificações e restrições

- Migrations e privilégios são verificados diretamente no projeto de produção.
- CI executa `npm run verify:prod` e testes estáticos das migrations; não executa pgTAP contra produção.
- O contrato pgTAP `supabase/tests/dashboard_etapa4_security_contract.sql` permanece disponível, mas não foi executado, conforme a orientação de não criar ambiente de testes.
- Nenhuma fixture ou OS fictícia será inserida na produção para simular dependências.
- Não há integração de reserva física de materiais com a agenda; materiais continuam como não verificados quando não existe fonte vinculada.

## Publicação

- PR #555: **draft, sem merge**.
- Frontend da Etapa 4: **não publicado**.
- Vercel de produção: continua na versão publicada da Etapa 3.
- Banco: migrations aplicadas diretamente em produção; nenhuma regra, calendário, exceção ou dependência foi criada automaticamente.
