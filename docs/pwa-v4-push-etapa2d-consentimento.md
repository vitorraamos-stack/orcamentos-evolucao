# EvoluSystem PWA V4 — Etapa 2D: consentimento por dispositivo

**Status: PR isolado em desenvolvimento.** Não fazer merge, aplicar migrations,
publicar ou ativar notificações sem autorização específica.

## O que foi integrado

A central de notificações do PR #601 agora inclui o cartão
**Notificações no dispositivo** (\`PushNotificationPreferences\`).

- Verifica compatibilidade, conexão HTTPS, disponibilidade de Service Worker,
  API de Notificações e PushManager.
- No iPhone/iPad identifica a necessidade de abrir o EvoluSystem instalado
  na Tela de Início e reutiliza o guia de instalação já existente.
- Consulta \`GET /api/push/config\`. Com flags desligadas (estado atual),
  mostra **Em preparação**, sem pedir permissão nem registrar dispositivo.
- Só chama \`Notification.requestPermission()\` **durante o clique explícito**
  em \`Ativar notificações\`, sem \`await\` antes da solicitação.
- Com permissão e configuração habilitadas futuramente, converte a chave
  pública VAPID e registra a inscrição via
  \`POST /api/push/subscriptions\`, autenticado com JWT atual. Nunca usa
  \`service_role\` nem VAPID privada no navegador.
- \`POST /api/push/status\` foi preparado para confirmar no servidor se a
  inscrição do dispositivo pertence à conta autenticada. O endpoint fica no
  **corpo JSON, não em URL/query string**.
- Botão de desativar revoga a inscrição da conta e cancela o PushManager
  localmente. Se a revogação no servidor falhar por rede, ainda desinscreve
  o navegador para proteger aparelho compartilhado e avisa sobre a
  necessidade de limpeza posterior.
- No logout local, tenta revogação autenticada antes de encerrar a sessão,
  desinscrevendo localmente mesmo que o serviço esteja offline.
  Sign-out disparado por outra aba também remove a inscrição do navegador.
- Evita promessas enganosas: com registro ativo, ainda falta
  implementar geração de eventos, serviço de despacho e habilitação
  controlada por flags.

## Arquivos da etapa

- \`src/modules/notifications/pushConsent.ts\`: lógica do cliente,
  disponibilidade e chamadas autenticadas (com timeout de rede).
- \`src/components/notifications/PushNotificationPreferences.tsx\`:
  cartão de configurações na central, texto acessível e estados.
- \`src/components/notifications/NotificationBell.tsx\`: integração visual.
- \`src/contexts/AuthContext.tsx\`: proteção durante logout.
- \`api/push/status.ts\`: consulta autenticada do status de vínculo.
- \`api/_shared/push/subscriptions.ts\`: adiciona acesso à RPC
  \`public.push_v4_subscription_status\`, preparada no PR #603.
- Testes unitários de validação do cliente, status autenticado e
  contratos estáticos de segurança.

## Dependências para futuro uso

1. Integrar e publicar **PR #603** (backend), antes da Etapa 2D.
2. Aplicar a migration das três funções SQL da Etapa 2C, com autorização.
3. Configurar par VAPID persistente e contato real exclusivamente no
   servidor Vercel; **não ativar flags nesta fase**.
4. Implementar serviço de geração de eventos, outbox transacional,
   resolução de destinatários, fila, dispatch autenticado e limpeza
   de inscrições expiradas. Somente depois habilitar envios.
5. Revisar endpoints reais no iOS/Android, testar permissão negada,
   usuário sem módulo, mudança de conta, logout offline, até cinco
   dispositivos e notificação com aplicativo fechado.

## Limitação conhecida

As inscrições vinculadas ao servidor não são revogadas se o logout ocorrer
sem rede. O navegador cancela sua própria inscrição, impossibilitando
novas entregas locais; o registro remoto órfão precisa ser removido
pelo processo de limpeza (HTTP 404/410 no emissor). Uma política de
limpeza automática por inatividade deve ser criada antes de ativar envios.

Não existe função/cron de entrega, não há nova migration nesta etapa e a
\`PWA_PUSH_REGISTRATION_ENABLED\` continua falsa por padrão.
