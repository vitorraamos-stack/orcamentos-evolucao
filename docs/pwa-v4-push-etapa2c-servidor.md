# EvoluSystem PWA V4 — Etapa 2C: API de inscrição (draft, não publicada)

> **Estado em 2026-11-11:** implementação em branch isolada. NÃO aplicar a
> migration, ativar variáveis de Push, fazer merge ou publicar sem aprovação.
> A fundação V4 anterior foi publicada (migration \`20261111105940\`).
> Os envios com o PWA fechado **ainda não funcionam** nesta etapa.

## Objetivo

Preparar a API autenticada para vincular/desvincular até cinco instalações do
PWA por conta, por meio de um endpoint de Push gerado pelo próprio navegador.
Não expor à internet o esquema \`private\` do Supabase, endpoint ou chaves de
inscrição. O usuário precisará autorizar notificações em um gesto explícito na
etapa de UX (2D).

## Implementação

- \`api/push/config.ts\`: \`GET /api/push/config\`, retorna
  \`{ok:true,enabled:false,publicKey:null}\` enquanto a inscrição estiver
  desativada; quando habilitada, revela **somente chave pública VAPID**.
- \`api/push/subscriptions.ts\`: \`POST /api/push/subscriptions\` recebe
  \`{subscription:{endpoint,keys:{p256dh,auth}}}\`; \`DELETE\` recebe
  \`{endpoint}\`. Ambos exigem JWT Supabase em
  \`Authorization: Bearer <access_token>\` e chamam \`auth.getUser(token)\`
  no servidor. A identidade jamais vem do corpo do pedido.
- \`api/_shared/push/subscriptions.ts\`: valida endpoint HTTPS em host
  conhecido de Apple/Google/Mozilla/Microsoft, sem IP local, portas
  customizadas nem credenciais na URL; valida chaves criptográficas e
  calcula SHA-256 do endpoint. Aplica limite do corpo e respostas sem
  segredos. Nenhum envio de Push é realizado por essa API.
- \`supabase/migrations/20261111152913_pwa_v4_push_subscription_rpcs.sql\`:
  três funções em \`public\` (\`register\`, \`revoke\` e \`status\`) que
  usam \`SECURITY INVOKER\` e acesso à tabela \`private.push_subscriptions\`
  via \`service_role\`. Executar essas funções via Supabase REST/RPC é possível
  **sem expor o esquema \`private\` no Data API**.
- As funções revogam \`EXECUTE\` de \`PUBLIC\`, \`anon\` e \`authenticated\`.
  Somente \`service_role\` obtém \`EXECUTE\` explícito. \`register\` verifica
  acesso a \`hub_os\` na base; cada endpoint pertence no máximo a uma conta.
  Uma inscrição de outra conta não pode ser tomada, mesmo que revogada.
  Limite de **cinco dispositivos ativos por usuário**, serializado com
  advisory lock para evitar corridas.
- \`src/modules/notifications/pushServerStageContract.test.ts\` e
  \`api/_shared/push/subscriptions.test.ts\`: segurança estática,
  autenticação, validação de endpoints, flags e revogação.

## Flags previstas (não configurar para true nesta etapa)

| Variável no servidor Vercel | Valor inicial | Exposição |
| --- | --- | --- |
| \`PWA_PUSH_REGISTRATION_ENABLED\` | \`false\` (por ausência da variável) | Backend |
| \`PWA_PUSH_VAPID_PUBLIC_KEY\` | Ausente | Apenas via API quando habilitado |
| \`PWA_PUSH_VAPID_PRIVATE_KEY\` | Ausente | Backend exclusivamente |
| \`PWA_PUSH_VAPID_SUBJECT\` | Ausente | Backend (ex. \`mailto:suporte@dominio.com\`; escolher contato real) |
| \`PWA_PUSH_DELIVERY_ENABLED\` | \`false\` (não implementada) | Backend |
| \`SUPABASE_SERVICE_ROLE_KEY\` | Já utilizado em outras APIs | Backend exclusivamente |

Não incluir VAPID privada em \`VITE_*\`, frontend, console ou repositório.
**Não gerar chaves neste PR:** provisionamento/rotação exigem planejamento e
ativação posterior, e gerar uma chave nova em cada deploy quebraria inscrições.

## Segurança por padrão

1. \`POST\` retorna **503** enquanto flag/chaves não estiverem configuradas.
2. \`DELETE\` pode revogar uma inscrição própria mesmo com registro desligado,
   útil para logout e troca de conta (após migration autorizada).
3. O servidor verifica usuário com \`getUser(access_token)\` antes de chamar
   a função SQL; o SQL exige módulo \`hub_os\` e não permite sequestro
   de endpoint de outro usuário.
4. O schema \`private\` segue sem acesso REST, sem grants a usuários.
5. Não informar se endpoint pertence a outro usuário: código
   genérico \`endpoint_unavailable\`, sem retornar URL ou chave.
6. Não há rotina de envio, gatilho, fila ativa, Vercel Cron ou
   alterações das OS; nenhum evento gera Push.

**Atenção:** os hosts confiáveis precisam ser revisados com endpoints reais
produzidos por iOS/Android antes da ativação. Essa allowlist protege o
servidor contra SSRF na futura rotina de entrega, mas a política DNS/redirect
ainda exigirá revisão no serviço emissor.

## Validação e gates

- CI via \`npm run verify:prod\`: TypeScript + Vitest + build do PWA.
- Validar manualmente cenários com token expirada, usuário sem módulo,
  dois usuários em um celular, endpoint de terceiro, cadastro simultâneo,
  limite cinco aparelhos, dispositivo desinscrito, body grande e falta de rede.
- Sem homologação local, conforme preferência da gestão; não afirmar
  execução de teste real no banco sem fazê-lo.

**Próxima aprovação específica necessária:** autorização para aplicar a
migration SQL e publicar as APIs com as flags desligadas. **Mesmo depois,
Push com app fechado ainda precisará** da Etapa 2D (consentimento e UX) e
da Etapa 2E (geração de eventos canônicos, filas, VAPID e delivery worker).
