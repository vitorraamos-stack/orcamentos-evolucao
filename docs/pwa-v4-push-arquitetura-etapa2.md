# EvoluSystem PWA v4 — Etapa 2: arquitetura proposta de Push

> **Status: PLANEJAMENTO — NÃO AUTORIZADO PARA APLICAÇÃO.**
> Este documento não é uma migration, não altera Supabase, não habilita o envio e não autoriza merge/publicação. É um plano para revisão e autorização específica da gestão.

## 1. Objetivo e limites

Entregar Web Push para usuários autenticados no EvoluSystem instalado em iOS e Android, inclusive com o aplicativo fechado, notificando novas atribuições, entrada de OS em Arte, liberação para Produção e instalações agendadas/reagendadas. Evitar acesso a recursos não autorizados, notificações inventadas, informações sensíveis na tela bloqueada e duplicidades.

A central local de avisos do PR #601 permanece provisória até a adoção do histórico persistente gerado no servidor. **O código existente do service worker apenas recebe notificações; não há inscrição, emissão nem banco para Push.** Não usar \`os_orders_event\` como fonte de verdade: a tabela tem política de INSERT para clientes autenticados com acesso ao Hub OS, e eventos de auditoria não são prova suficiente de uma transição canônica.

## 2. Diagnóstico técnico confirmado (2026-11-11, somente leitura)

- Frontend React/Vite e PWA: \`public/sw.js\`, \`public/manifest.webmanifest\` (manifest \`id: "/"\`, \`display: "standalone"\`).
- Backend existente: Vercel Functions sob \`api/\`; Supabase para Auth, Postgres, Realtime.
- Projeto Supabase: \`evolucao-orcamentos\`. Existem \`os_orders\`, \`os_order_assignees\`, \`os_installations\`, \`os_installation_team_members\`, \`profiles\`, \`user_module_access\` e \`os_orders_event\`.
- Tabelas \`push_subscriptions\`, \`user_notifications\`, \`notification_outbox\` e similares: **ainda inexistentes**.
- \`os_orders\`, \`os_order_assignees\` e \`os_installations\` já estão na publicação Realtime; \`os_orders_event\` não está.
- Extensões \`pg_cron\` e \`pg_net\`: **não estão habilitadas**. Recomendação: reaproveitar **Vercel Cron (Pro)**, sem habilitar essas extensões neste escopo.
- O fluxo operacional usa \`os_orders.art_status\`, \`os_orders.prod_status\`, atribuições por \`order_id/user_id/scope\`, e instalações com \`status\`, horários, \`team_id\`, \`responsible_id\`.
- O PR #601 está em rascunho, com preview de branch desabilitado em \`vercel.json\`.

## 3. Arquitetura prevista

\`\`\`text
Fluxos operacionais autenticados (OS / responsáveis / instalações)
          |
          v
Triggers de transição canônica — insert apenas após mudança efetiva
          |
          v
private.notification_source_outbox (uma chave idempotente por transição)
          |
          v
Vercel Cron → GET /api/push/dispatch (CRON_SECRET)
          |
          +--> resolver destinatários e revalidar permissões/atribuições
          |         |
          |         +--> public.user_notifications (RLS usuário)
          |         |
          |         +--> private.push_delivery_jobs (1 por aviso/dispositivo)
          |
          +--> enviar Web Push assinado VAPID usando inscrições privadas
                    |
                    v
             Service worker / PWA
               |           |
          Aviso genérico    Clique abre rota interna sob guards de acesso

Browser autenticado:
 botão "Ativar notificações" (gesto do usuário)
   → Notification.requestPermission / PushManager.subscribe
   → POST /api/push/subscriptions (JWT validado)
   → private.push_subscriptions (sem acesso REST direto ao navegador)
\`\`\`

### Estruturas propostas (ainda **sem SQL/migrations**)

1. **\`private.notification_source_outbox\`**: \`id\`, \`event_kind\`, \`resource_id\`, \`source_key\` UNIQUE, \`recorded_at\`, \`state\`, \`retry_at\`, \`attempt_count\`, \`last_error_code\`. Apenas gatilhos/serviços internos podem gravar; payload não contém dados comerciais.
2. **\`public.user_notifications\`**: \`id\`, \`recipient_id\`, \`source_event_id\`, \`kind\`, \`resource_id\`, \`created_at\`, \`read_at\`, \`expires_at\`. UNIQUE \`(source_event_id, recipient_id)\`. RLS: usuário lê apenas as próprias linhas. Atualização restrita à marcação de leitura, sem poder trocar \`recipient_id\`, \`kind\`, \`resource_id\` ou \`source_event_id\`. Inserção apenas por processo autorizado.
3. **\`private.push_subscriptions\`**: \`id\`, \`user_id\`, \`endpoint_hash\` UNIQUE, \`endpoint\`, \`p256dh\`, \`auth\`, \`created_at\`, \`last_seen_at\`, \`revoked_at\`, \`last_success_at\`, \`failure_count\`. Chaves/endpoint privados, nunca disponibilizados por SELECT público. Atualização e exclusão apenas por API que valida o usuário. Definir política de retenção e criptografia em repouso com a gestão.
4. **\`private.push_delivery_jobs\`**: \`id\`, \`notification_id\`, \`subscription_id\`, \`status\`, \`attempt_count\`, \`next_attempt_at\`, \`last_http_status\`, \`created_at\`, \`updated_at\`. UNIQUE \`(notification_id, subscription_id)\`. Claim transacional com \`FOR UPDATE SKIP LOCKED\` e lease/timeout para concorrência e reprocessamento.

**Esquemas e privilégios:** \`private\` não exposto no Data API; \`public.user_notifications\` com RLS e GRANTs mínimos; \`anon\` sem acesso; service-role só no backend. Functions e eventuais rotinas com privilégios elevados devem usar \`search_path\` explícito, privilegiar papel mínimo e revogar EXECUTE de PUBLIC/anon/authenticated onde couber. Revisão de segurança obrigatória antes de aplicar.

## 4. Matriz de eventos, fonte canônica e destinatários

| Tipo | Fonte e regra de origem | Destinatários, revalidados no servidor |
| --- | --- | --- |
| \`assignment\` | INSERT/UPDATE real de \`os_order_assignees\`: mudança efetiva de \`user_id/scope\`. | Apenas novo responsável com \`hub_os\` e, se setorial, módulo/permissão pertinente. Remoção não envia novo Push. |
| \`art_inbox\` | Criação de OS ou transição válida de \`os_orders.art_status\` para fila de Arte. Não confiar em evento \`create\` isolado. | Colaboradores habilitados para Arte (não consultores sem módulo). Preferir responsáveis setoriais; fallback controlado para equipe autorizada. |
| \`production_released\` | Alteração efetiva \`OLD.art_status <> 'Produzir'\` e \`NEW.art_status = 'Produzir'\`. | Responsáveis de Produção; se não houver, pessoas autorizadas a operar o quadro conforme regra definida. |
| \`installation_scheduled\` | INSERT real em \`os_installations\` com \`status = 'SCHEDULED'\` e horário preenchido. | \`responsible_id\`, membros de \`team_id\` e gestão apenas conforme preferência/escopo permitido. |
| \`installation_rescheduled\` | UPDATE real em \`os_installations\` com mudança de \`scheduled_start/end\`, \`team_id\` ou \`responsible_id\`, não simples \`updated_at\`. | Equipe atual autorizada. Em troca de equipe, não enviar aviso novo à equipe removida. |

- OS arquivada, removida, cancelada ou sem permissão não deve gerar despacho, mesmo que exista item pendente na fila.
- Para atribuições, conferir o vínculo **atual** antes da entrega.
- Cada evento deve receber chave de origem **idempotente**, derivada de identidade/versão transacional do evento, e não apenas de hora arredondada.
- Políticas de notificação para gestão e broadcast setorial são uma decisão de produto: início com escopo restrito, evitando alertar todo o escritório.
- Evitar alteração comportamental de gatilhos existentes: registrar eventos em uma integração separada, não executar HTTP nem criptografia durante atualizações de OS.

## 5. Servidor e endpoints planejados

| Operação | Autenticação e validação |
| --- | --- |
| \`GET /api/push/config\` | Fornece somente VAPID **público** e sinal de disponibilidade (sem secrets). |
| \`POST /api/push/subscriptions\` | JWT Supabase validado no servidor, consentimento obtido via gesto, validação de endpoint e chaves, limite de dispositivos/conta, proteção contra abuso. |
| \`DELETE /api/push/subscriptions\` | JWT validado, opera apenas inscrição do próprio usuário/dispositivo. Ao sair, revogar vínculo no servidor e \`unsubscribe\` local quando possível. |
| \`GET /api/push/status\` | JWT validado, responde apenas estado booleano do dispositivo atual. |
| \`GET /api/push/dispatch\` | Exclusivo do cron: bearer \`CRON_SECRET\` em comparação segura, sem cookies e sem execução por usuários autenticados comuns. |

A leitura/marcação de \`user_notifications\` pode ser feita via Supabase RLS diretamente, com atualização limitada de \`read_at\` (por permissão de coluna ou função validada). Se for usada API intermediária, manter a mesma regra de titularidade.

O processo Vercel Cron chama função de servidor (não o navegador). \`CRON_SECRET\`, chave VAPID privada e credencial privilegiada do Supabase ficam **somente** em variáveis de ambiente de produção; nunca em \`VITE_*\`, logs, repositório ou payload push. Função com limite de itens por lote, lease transacional, retries exponenciais com jitter, \`429\` respeitando \`Retry-After\`, remoção de endpoint expirado (404/410). Sucesso HTTP indica aceitação no serviço Push, **não comprova visualização** pelo usuário.

## 6. Cliente, consentimento e privacidade

- Exibir **Ativar notificações** nas preferências do PWA, com explicação breve; só chamar \`Notification.requestPermission()\` após toque explícito.
- iPhone/iPad: solicitar depois de adicionar o EvoluSystem à Tela de Início; não mostrar mensagem de erro enganosa quando aberto em aba normal do Safari.
- Verificar \`isSecureContext\`, \`serviceWorker\`, \`PushManager\`, \`Notification\` e \`Notification.permission\` antes do fluxo.
- Desativar, reativar ou reenquadrar inscrições em login/logout/troca de conta; não reutilizar inscrição do perfil anterior em aparelho compartilhado.
- Push carrega só \`{ kind, orderId }\`, limitado pela whitelist do SW. Mostrar textos genéricos na tela bloqueada, sem clientes, arquivos, endereço, preços ou conteúdos dos comentários.
- Ao tocar, revalidar autenticação, acesso ao módulo e visibilidade da OS antes de abrir.
- Histórico fica restrito ao usuário (RLS); marcar leitura sincroniza entre dispositivos quando o novo backend estiver ativo.
- Proposta de retenção para aprovar: notificações 30 dias (ou 14 na interface), delivery logs 7 dias, subscriptions revogadas removidas imediatamente e inscrições antigas sem atividade limpas após 90 dias. Rever com política LGPD.

## 7. Rollout seguro por subetapas

| Etapa | Escopo | Gate/validação |
| --- | --- | --- |
| **2A — Proposta** | Este documento, levantamento read-only e contratos; nenhuma infraestrutura ativada. | Aprovação de arquitetura e da próxima fase pelo responsável. |
| **2B — Banco** | Preparar/aplicar migrations das 4 tabelas, RLS, índices, gatilhos desativados por flag; testes de autorização e rollback. | **Autorização explícita antes de criar/aplicar migrations.** |
| **2C — Servidor** | APIs de inscrição, serviço VAPID, geração de notificações canônicas, outbox e cron, inicialmente com \`PUSH_DELIVERY_ENABLED=false\`. | CI, teste de concorrência, retries, auditoria de credenciais e isolamento. |
| **2D — UX/consentimento** | Botão de ativação/desativação por dispositivo, autorização por gesto, badges sincronizadas e troca do modelo local provisório. | Teste de usabilidade e zero prompt automático; sessões/permissões. |
| **2E — Canary** | Teste com 1 ou 2 dispositivos internos, apenas eventos sintéticos sem dados reais; habilitação segmentada por feature flag. | iOS standalone, Android, permissões removidas, logout, modo offline, 404/410, anti-duplicidade. |
| **2F — Publicação** | Merge e deploy somente após confirmação dos gates e autorização específica. | Monitoramento pós-deploy e rollback por desabilitação de flag. |

**Flags recomendadas (ainda não configuradas):**
\`PWA_PUSH_REGISTRATION_ENABLED=false\`,
\`PWA_PUSH_GENERATION_ENABLED=false\`,
\`PWA_PUSH_DELIVERY_ENABLED=false\`.
Não registrar cron ativo até concluir os gates.

## 8. Critérios mínimos de aceite e testes negativos

- Usuários comerciais sem \`hub_os_arte\` / \`hub_os_producao\` não recebem notificações dos quadros.
- Atribuição a outra pessoa, usuário sem módulo, equipe removida e OS arquivada não provocam push.
- \`os_orders_event\` falsificado/duplicado, request externo sem JWT e chamadas diretas ao cron sem secret são rejeitados.
- Mesmo evento enviado duas vezes, dois cron em paralelo e retries não geram delivery jobs duplicados.
- Dois dispositivos do mesmo usuário recebem conforme suas inscrições; revogar um não bloqueia o outro.
- Logout, troca de usuário, endpoint expirado, permissão negada, navegador incompatível e conexão perdida são tratados sem dados privados em cache.
- Verificar \`403\`/RLS para leitura e marcação de notificações de outra pessoa; \`anon\` não vê nada.
- Evitar inundação: limite/cooldown por classe de evento e usuário, sem perder avisos críticos.
- Teste manual em **iPhone PWA instalado** e **Android PWA instalado** é obrigatório antes de produção.

## 9. Alternativas descartadas nesta etapa

- Push por polling JavaScript quando app está fechado: **não funciona**.
- Usar apenas \`os_orders_event\` como gatilho de envio: risco de evento gravado pelo cliente e de falta de idempotência.
- Chave privada VAPID no frontend: **proibido**.
- Gravar endpoints em \`localStorage\` como banco de subscrições: inviável e inseguro.
- Instalar \`pg_cron\` + \`pg_net\` só para Push: mais componentes que o necessário, já que o Vercel Pro oferece cron.
- Backend de terceiro: não necessário para o volume inicial, sujeito a revisão se o crescimento justificar.

## 10. Referências e documentos

- [Apple — Web Push para web apps](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)
- [WebKit — requisitos do iOS PWA Push](https://webkit.org/blog/13878/)
- [Vercel — Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Supabase — RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [RFC 8030 — Web Push](https://www.rfc-editor.org/rfc/rfc8030)
- [Código PWA no PR #601](https://github.com/vitorraamos-stack/orcamentos-evolucao/pull/601)

**Próxima autorização a solicitar:** aprovação do desenho e autorização para preparar migrations propostas em branch isolada, **sem aplicar no banco e sem publicar**. A aplicação dessas migrations deverá receber uma segunda autorização específica.
