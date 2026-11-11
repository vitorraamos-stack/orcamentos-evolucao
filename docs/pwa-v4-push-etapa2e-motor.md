# EvoluSystem PWA V4 — Etapa 2E: motor de eventos e Web Push

> **Status 2026-11-11: código de desenvolvimento em branch isolada.**
> **NÃO aplicar migration, fazer merge, publicar, configurar chaves ou ativar flags sem autorização específica.**
> Os PRs #603 (inscrição) e #606 (consentimento) permanecem sem publicação; este PR depende de ambos.

## Entrega da etapa

- Migration proposta \`20261111150000_pwa_v4_operational_push_dispatch.sql\`.
  - Três gatilhos AFTER em \`os_orders\`, \`os_order_assignees\` e \`os_installations\`, somente após transição de dados canônicos.
  - \`private.push_v4_runtime_settings\` com \`generation_enabled=false\` e \`delivery_enabled=false\`. Sem concessões UPDATE ao service_role ou autenticados. **A migration sozinha não registra eventos nem envia mensagens.**
  - Outbox idempotente por (evento/tabela/recurso/transação).
  - RPCs \`public.push_v4_expand_outbox\`, \`push_v4_job_eligible\`,
    \`push_v4_claim_jobs\`, \`push_v4_finish_job\` com \`SECURITY INVOKER\`
    e \`EXECUTE\` somente ao \`service_role\`.
  - Destinatários escolhidos a partir das tabelas reais e revalidados por módulo **na materialização e antes do envio**. Usuários sem \`hub_os\` e módulo requerido não recebem.
  - Histórico persistente \`user_notifications\` e jobs deduplicados por aviso/dispositivo. Contratos existentes em 20261111105940.
  - Concorrência controlada por \`FOR UPDATE SKIP LOCKED\`, lease de 90s, limite de 10 tentativas e backoff exponencial (máximo de 2 horas). Respostas 404/410 revogam o endpoint. Sem armazenar o corpo HTTP de erro ou informações sensíveis nos logs.
- Serviço servidor \`api/_shared/push/webPush.ts\`:
  - Criptografia AES128GCM seguindo RFC 8291/RFC 8188 com par ECDH P-256 efêmero, sal aleatório e HKDF/HMAC.
  - Assinatura VAPID ES256 (JWT com \`aud\` restrito à origem) usando chave privada em variável de ambiente.
  - Payload **mínimo**: \`{kind,orderId}\`. Sem cliente, valor, endereço, comentários ou arquivos.
  - Apenas endpoints HTTPS de serviços Push conhecidos (allowlist existente, sem URLs arbitrárias); sem redirects; \`AbortSignal.timeout\` de 7 segundos; \`Topic\` estável por job para coalescência no serviço Push.
- Serviço \`api/_shared/push/dispatchStore.ts\` e rota \`GET /api/push/dispatch\`:
  - Verifica \`Authorization: Bearer <CRON_SECRET>\` com comparação constante e secret de pelo menos 24 caracteres; nega acesso sem secret.
  - Além das flags **do banco**, exige **ambas** \`PWA_PUSH_GENERATION_ENABLED=true\` e \`PWA_PUSH_DELIVERY_ENABLED=true\` no ambiente e um par VAPID válido e persistente.
  - Sem chaves/flags, **não acessa o banco nem envia Push**. Reclama no máximo 4 jobs por invocação e envia em pares com rechecagem de elegibilidade.
  - **Sem cron configurado** nesta branch: rota pronta para agendamento futuro, sem execução automática.
- Testes CI: RSA? **Não**. VAPID real ES256 assinado e verificado; criptografia/decriptação de ponta a ponta no teste Node; endpoint allowlist e HTTP 410/429; cron inválido/desligado; contratos SQL e RLS.

## Eventos canônicos

| Evento | Quando registrar | Destinatários |
|---|---|---|
| \`assignment\` | nova atribuição ou troca de usuário/escopo em \`os_order_assignees\` | usuário atribuído, enquanto o vínculo existir e com módulo do escopo |
| \`art_inbox\` | nova OS em \`Caixa de Entrada\` ou retorno efetivo à fila de Arte | colaboradores com \`hub_os_arte\` habilitado |
| \`production_released\` | status da Arte efetivamente passa para \`Produzir\` | colaboradores autorizados ao módulo \`hub_os_producao\` |
| \`installation_scheduled\` | instalação \`SCHEDULED\` criada ou retomada | responsável e integrantes da equipe atual com \`hub_os_instalacoes\` |
| \`installation_rescheduled\` | troca real de horário, equipe ou responsável na instalação agendada | responsável e integrantes da equipe atual com módulo |

Não há envio para equipe removida, OS arquivada, dispositivo revogado, colaborador sem acesso ou evento de auditoria criado pelo cliente. A seleção por módulo evita expor os quadros de Arte e Produção à consultoria comercial sem permissão.

## Segurança e tratamento de erros

- Gatilho em \`private\` usa \`SECURITY DEFINER\` apenas porque updates operacionais usam RLS, e as tabelas outbox são privadas; \`search_path\` é fixo e \`EXECUTE\` está revogado para os papéis públicos.
- RPCs de processamento são \`SECURITY INVOKER\` e expostas somente ao \`service_role\`. A API não expõe o esquema \`private\` no Data API Supabase.
- Duas flags de produção + duas flags no banco. Ativar só uma camada **não é suficiente** para registrar ou entregar Push.
- Reenviar um HTTP após falha da confirmação do servidor **pode produzir entrega repetida**: o sistema oferece idempotência na materialização, coalescência \`Topic\` e retentativas, mas Web Push é modelo de entrega *ao menos uma vez*, não garantia exatamente uma vez.
- Erros externos não são gravados com URL ou payload. Respostas à rota mostram apenas contagens.
- Injeção/SSRF: somente destinos de Push HTTPS aprovados; revisar allowlist com URLs reais antes da ativação em celulares. Não aceitar HTTP redirects.
- \`CRON_SECRET\`, \`PWA_PUSH_VAPID_PRIVATE_KEY\` e \`SUPABASE_SERVICE_ROLE_KEY\` são segredos de servidor; **nenhuma variável \`VITE_*\` pode conter esses valores**.
- Nunca gerar novo VAPID em cada deploy: preservar chave por toda a vida das inscrições ou planejar rotação.
- O botão de consentimento do PR #606 ainda não estará operacional até as migrations de inscrição e flags de cadastro serem aprovadas.

## Limites, dependências e ativação futura

1. Concluir/revisar o PR #603 + aplicar sua migration de RPC em produção **apenas mediante autorização**.
2. Concluir/revisar o PR #606 (UX) e esta Etapa 2E, sem alterar as permissões existentes.
3. Revisar a SQL 2E, testes de RLS com dois usuários, configuração dos papéis e competição de workers. A gestão dispensou teste em banco isolado nas etapas anteriores; **CI não substitui testes reais de migrations e dispositivos**.
4. Provisionar chave VAPID única e \`CRON_SECRET\` seguro na Vercel e configurar \`PWA_PUSH_VAPID_SUBJECT\` com contato real.
5. Preparar agendamento via \`vercel.json\` (\`*/1 * * * *\`), **em PR de ativação separado**. Não agendar enquanto flags não autorizadas.
6. Ativar gradualmente primeiro a geração e depois a entrega no Supabase, **com autorização explícita**, junto das variáveis Vercel. Recomenda-se início restrito à gestão e baixo volume; a versão atual ainda não implementa flag de canário por usuário.
7. Testar iPhone PWA instalado e Android PWA instalado, permissões negadas, duas contas no mesmo dispositivo, recebimento com app fechado, troca de equipe, push duplicado, endpoint expirado, logout sem rede e reversão de permissão.
8. Para central unificada com leitura sincronizada, integrar futuramente \`public.user_notifications\` à interface que hoje usa histórico local projetado. O backend persistente estará pronto quando esta etapa for aplicada e ativada.
9. Criar limpeza agendada de histórico/inscrições vencidas e métricas de observabilidade antes de uso em escala.

**Não foi aplicada migration nesta etapa. O sender não está agendado nem ativo. Não houve publicação.**
