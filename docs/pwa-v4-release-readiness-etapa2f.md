# EvoluSystem PWA V4 — Etapa 2F: preparação de release e ativação

> **Atualização 11/11/2026:** As migrations de inscrição e motor foram aplicadas no Supabase, com as flags de geração e entrega desligadas. PR ainda sem merge ou deploy.
> O usuário autorizou **preparar a próxima fase**, não ligar o serviço.
> As alterações deste PR não estão em produção.
> Histórico: PR #603 (API inscrição) → PR #606 (consentimento) →
> PR #607 (motor e envio) → PR desta etapa (readiness + agendamento preparado).

## Objetivo

Ter uma publicação tecnicamente controlável dos componentes PWA V4, com
serviço de envio preparado e três barreiras que, por padrão, mantêm tudo
desligado. Permitir medir prontidão sem expor chaves privadas ou dados das OS.

## Mudanças de preparação

- **Cron Vercel adiado:** não será publicado nesta etapa até termos permissão para verificar e configurar o `CRON_SECRET`. O agendamento `*/2 * * * *` permanece apenas como proposta anterior, não como configuração ativa. O trecho abaixo descreve o desenho original:

- Agendamento Vercel **originalmente planejado**:
  \`GET /api/push/dispatch\`, expressão \`*/2 * * * *\` (a cada 2 minutos).
  O Vercel só agenda cron a partir do deployment de produção; esta branch
  desabilita preview. Em eventual publicação autorizada, o cron poderá chamar
  a rota, mas **não enviará mensagens** até as flags serem habilitadas em
  Vercel **e** no Supabase. Se o \`CRON_SECRET\` ainda não estiver configurado,
  a rota responderá 401 e nenhum serviço interno será acessado.
- Trava extra: \`PWA_PUSH_ROLLOUT_ENABLED\` deve ser \`"true"\`
  **além** de \`PWA_PUSH_GENERATION_ENABLED\` e
  \`PWA_PUSH_DELIVERY_ENABLED\`. Todas ficam desativadas por ausência.
- \`GET /api/push/readiness\` autenticado por \`CRON_SECRET\`.
  Endpoint read-only: responde apenas booleanos de configuração e contagens,
  sem inscrições, endpoints, tokens, chaves ou identificadores de usuários.
- A migration **não aplicada** do PR #607 recebeu uma RPC somente de leitura:
  \`public.push_v4_release_readiness()\`, acessível apenas ao
  \`service_role\` para resumir flags e tamanho das filas.
- Fencing na fila: agora \`push_v4_job_eligible\` e
  \`push_v4_finish_job\` exigem o número da tentativa reclamada.
  Um worker lento não pode finalizar a tentativa que outro worker reclamou.
  A lease precisa ainda estar válida na hora da conclusão.
- Mensagens de inscrição continuam exigindo autorização **explícita** do
  navegador e chaves VAPID persistentes.

## Validações de integração

- O main avançou desde o início da V4 apenas em arquivos de Dashboard,
  logística e indicadores. Não houve alteração direta nos arquivos Push
  nesse intervalo; conflitos deverão ser rechecados antes do merge.
- CI deve validar TypeScript, Vitest (incluindo RFC8291, VAPID, autorização,
  fencing, gates e readiness), build do PWA e formato do \`vercel.json\`.
- GitHub Actions é verificação de código. **Não confirma o funcionamento
  de migrations em produção nem entrega física em iOS/Android.**
- Por decisão da gestão não se usa banco local/homologação; a aplicação futura
  deverá ter conferências somente de leitura antes/depois da migration e
  travas desligadas. Ainda há risco residual de SQL não testada em execução.

## Variáveis necessárias antes de publicação

Configurar **pelo painel da Vercel**, na Production environment e
somente por administradores. Não enviar valores no chat, GitHub ou logs.

| Variável | Uso | Valor inicial seguro |
|---|---|---|
| \`SUPABASE_URL\` / \`VITE_SUPABASE_URL\` | URL do projeto | existente; confirmar |
| \`SUPABASE_SERVICE_ROLE_KEY\` | chamadas privilegiadas | servidor, existente; confirmar |
| \`CRON_SECRET\` | autentica o cron e o readiness | segredo forte, no servidor |
| \`PWA_PUSH_VAPID_SUBJECT\` | contato real VAPID | \`mailto:\` com e-mail oficial da empresa |
| \`PWA_PUSH_VAPID_PUBLIC_KEY\` | chave pública estável | 65 bytes P-256 em base64url |
| \`PWA_PUSH_VAPID_PRIVATE_KEY\` | assina entrega Web Push | 32 bytes P-256 em base64url; **servidor** |
| \`PWA_PUSH_REGISTRATION_ENABLED\` | inscrição de aparelhos | \`false\` / ausente |
| \`PWA_PUSH_GENERATION_ENABLED\` | autoriza processamento na rota | \`false\` / ausente |
| \`PWA_PUSH_DELIVERY_ENABLED\` | autoriza entrega na rota | \`false\` / ausente |
| \`PWA_PUSH_ROLLOUT_ENABLED\` | autorização final do cron | \`false\` / ausente |

**Nunca incluir private VAPID, CRON_SECRET ou service_role em \`VITE_*\`.**
Gerar par VAPID uma única vez e armazenar em gerenciador de segredos;
trocas devem considerar inscrições existentes. O \`CRON_SECRET\` é
consumido automaticamente pelo Vercel Cron quando configurado.

**Bloqueio real de permissão:** a conexão Vercel atual retornou
\`403 forbidden\` ao tentar **listar metadados** das variáveis do projeto.
Não houve tentativa de decriptar segredos ou alterá-los. O provisionamento e
a conferência do nome das variáveis dependem do painel do proprietário ou
de permissão apropriada para o conector. Não assumir que já existem.

## Sequência segura sugerida (cada etapa exige autorização pertinente)

1. **Revisão final:** inspecionar diffs e concluir CI. PRs #603, #606, #607
   e #608 permanecem rascunho até autorização.
2. **Banco (nova autorização):** aplicar primeiro migration
   \`20261111152913_pwa_v4_push_subscription_rpcs.sql\`, depois
   \`20261111153110_pwa_v4_operational_push_dispatch.sql\`.
   Confirmar histórico, grants das RPCs e flags
   \`generation_enabled=false\`, \`delivery_enabled=false\`.
   Nunca executar SQL de ativação no mesmo passo.
3. **Vercel (nova autorização):** confirmar chaves e contato, configurar
   as variáveis sem ativar flags, merge dos PRs na ordem de dependências e
   publicação **uma única vez**, verificando deployment READY, alias oficial,
   rota \`/api/push/config\` mostrando \`enabled:false\` e
   \`/api/push/dispatch\` negando requisições sem \`CRON_SECRET\`.
4. **Preflight (read-only):** chamar \`GET /api/push/readiness\` usando
   CRON_SECRET em sistema de testes autorizado para autenticação.
   Confirmar RPCs, chaves corretas e fila vazia, sem exibir seus valores.
5. **Canário de opt-in (nova autorização):** ativar **somente**
   \`PWA_PUSH_REGISTRATION_ENABLED=true\`, testar 1-2 usuários da gestão no
   PWA instalado; ainda sem gerar nem enviar Push.
6. **Canário de envio (nova autorização):** habilitar somente após checar
   revogação, idempotência, permissões e cron:
   flags de geração e entrega no banco, flags de geração e entrega na Vercel
   e **por último** \`PWA_PUSH_ROLLOUT_ENABLED=true\`.
   Lembrar que env vars alteradas na Vercel podem requerer redeploy para
   surtir efeito.
7. **Observabilidade:** começar com volume baixo, medir erro 401/403/404/410/429,
   falhas e consumo do cron. Proposta \`*/2\` = ~720 chamadas/dia
   quando o deployment estiver ativo; confirmar limites/custos no plano.
8. **Rollback:** desativar \`delivery_enabled\` no banco é o
   bloqueio de emergência mais imediato, seguido da flag de rollout
   no ambiente para novos deployments; sem \`DROP TABLE\`.

## Escopo ainda pendente

- Testes físicos em iPhone e Android com aplicativo instalado.
- Notificações persistentes sincronizadas na UI substituindo o estado local.
- Retenção e limpeza programada de filas e inscrições revogadas.
- Canário por usuário e gestão de preferências por evento.
- Observabilidade/limites de custo em produção.

**Nenhum envio Push está ativo e nenhuma migration deste PR foi aplicada.**

## Estado atualizado da implantação

- Migration de inscrições: `20261111152913` aplicada, privilégios conferidos.
- Migration do motor: `20261111153110` aplicada, geração e entrega desativadas (`false`).
- O agendamento automático foi removido do `vercel.json` enquanto o `CRON_SECRET` não estiver disponível.
- Variáveis Vercel não foram consultadas ou alteradas: conector retornou 403 para listagem de metadados.
