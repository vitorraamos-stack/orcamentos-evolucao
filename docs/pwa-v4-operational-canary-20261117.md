# EvoluSystem — Ativação piloto do Push operacional (17/11/2026)

## Escopo
Enviar Web Push somente à conta canário previamente registrada, apenas nos eventos:
- `assignment`: a conta piloto recebe atribuição de OS
- `production_released`: OS muda efetivamente para "Produzir"
- `installation_scheduled`: uma instalação é agendada

`art_inbox` e `installation_rescheduled` ficam excluídos da entrega Push no piloto inicial; outros eventos também não são enviados. Sem OS fictícias.

## Agendamento e segurança
- Cron Vercel Production: `GET /api/push/dispatch` a cada 2 minutos.
- A API requer `Authorization: Bearer <CRON_SECRET>` e só processa com `PWA_PUSH_GENERATION_ENABLED=true`, `PWA_PUSH_DELIVERY_ENABLED=true`, `PWA_PUSH_ROLLOUT_ENABLED=true`, VAPID válido e `PWA_PUSH_CANARY_USER_IDS` não vazio.
- O banco exige `private.push_v4_runtime_settings.generation_enabled=true` e `delivery_enabled=true`. Enquanto ambos forem false, nenhum trabalho operacional é criado ou enviado.
- O dispatcher usa `push_v4_expand_canary_outbox` e `push_v4_claim_canary_jobs`: filtram destinatários antes de criar avisos e antes da entrega.
- O payload contém apenas tipo do evento e UUID de OS, sem nomes de clientes, valores, endereços ou textos livres.
- Existem duas inscrições ativas vinculadas à mesma conta piloto. Cada evento pode aparecer nos dois dispositivos.

## Procedimento de ativação, em etapas controladas
1. Publicar este código e cron com as flags do Supabase ainda desativadas. A rotina agendada pode executar, mas não envia avisos.
2. Confirmar no painel Vercel Production que `CRON_SECRET` tem comprimento adequado e que `PWA_PUSH_CANARY_USER_IDS` contém **somente o UUID da conta piloto**; nunca compartilhar valores de segredos no chat.
3. Configurar `PWA_PUSH_GENERATION_ENABLED=true`, `PWA_PUSH_DELIVERY_ENABLED=true` e `PWA_PUSH_ROLLOUT_ENABLED=true` somente em Production, sem criar variáveis públicas. Fazer redeploy.
4. Validar cron sem erro de autorização e travas do banco ainda false.
5. Somente então ativar as duas flags do banco, conferindo contagens de eventos e jobs e deixando o comando de reversão preparado.
6. Validar com movimentações legítimas de OS já existentes, sem inventar OS ou atribuições.
7. Monitorar aceites/falhas e duplicidades sem expor URLs de inscrições.

## Rollback imediato
Usar o acesso de proprietário do Supabase para colocar `private.push_v4_runtime_settings.delivery_enabled=false`. Depois desligar `PWA_PUSH_ROLLOUT_ENABLED` no painel Vercel e republicar.

## Limite de acesso
O conector Vercel atual pode responder 403 ao listar/editar variáveis de produção. Enquanto não for possível verificar as variáveis, não ativar os dois switches do banco. Nunca inserir segredos no GitHub, em mensagens ou em URLs.
