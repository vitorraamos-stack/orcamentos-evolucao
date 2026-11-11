> **Atualização de publicação 2026-11-11:** a migration de fundação foi aplicada no Supabase de produção (histórico `20261111105940`), mediante autorização da gestão. Nenhum serviço Push ou cron foi ativado. Os trechos abaixo são o plano original, anterior à aplicação.

# EvoluSystem PWA V4 — Etapa 2B: proposta de migration + segurança

> **APENAS REVISÃO**. Arquivos de migration e testes preparados em branch isolada.
> **Nenhuma migration foi aplicada ao Supabase. Não há Push ativo nem deploy.**
> A etapa de execução exige outra autorização explícita da gestão.

## Contexto e dependências

- Base: branch de V4 Etapa 1 (\`feat/pwa-v4-notificacoes-etapa1-20261110\`), PR #601.
- Branch desta proposta: \`feat/pwa-v4-push-schema-security-20261111\`.
- SQL único e atômico: \`supabase/migrations/20261111105940_pwa_v4_push_schema_foundation.sql\`.
- Verificações de banco **para ambiente local descartável após aplicar localmente**:
  \`supabase/tests/pwa_v4_push_schema_security.sql\` (43 asserções pgTAP).
- Contrato estático para CI, sem banco: \`src/modules/notifications/pushSchemaSecurityContract.test.ts\`.
- O ambiente de autoria não dispõe do executável da Supabase CLI; o nome do SQL
  foi criado usando timestamp UTC e a convenção atual do repositório. Antes de
  qualquer aplicação, verificar o histórico real e a versão da CLI com
  \`supabase --version\`, \`supabase migration list\` e \`supabase db diff\`
  em um ambiente de desenvolvimento autorizado. **Não executar isso em produção nesta etapa.**

## O que o SQL faz caso seja aplicado no futuro

| Estrutura | Esquema | Acesso |
| --- | --- | --- |
| \`notification_source_outbox\` | \`private\` | Apenas backend privilegiado |
| \`user_notifications\` | \`public\` | Usuário vê apenas seu histórico autorizado; altera somente \`read_at\` |
| \`push_subscriptions\` | \`private\` | Apenas backend autenticado e validado para registrar dispositivo |
| \`push_delivery_jobs\` | \`private\` | Apenas processo confiável de despacho |

Regras: UUIDs e FKs; \`UNIQUE\` para idempotência; CHECKs de tipo/módulo,
estado e tamanho; índices de leitura/processamento; RLS ligada nas quatro tabelas;
REVOKE dos privilégios automáticos; sem políticas de acesso direto às estruturas privadas.

**Sem** funções \`SECURITY DEFINER\` novas, gatilhos, cron, alterações
das tabelas existentes, endpoints, VAPID ou configuração de envio. Se esta
migration for aprovada futuramente, somente as tabelas vazias serão criadas.
Nenhum Push será enviado pelo SQL isoladamente.

## Matriz de permissões esperada

| Ator | Histórico próprio (RLS) | Marcar leitura | Inscrições/segredos | Outbox/fila |
| --- | --- | --- | --- | --- |
| \`anon\` | Não | Não | Não | Não |
| \`authenticated\` com \`hub_os\` e módulo requerido | Apenas próprio, OS não arquivada e não expirado | Somente \`read_at\` da própria linha | Não | Não |
| \`authenticated\` sem módulo ou com módulo revogado | Não | Não | Não | Não |
| \`service_role\` **no backend** | Sim | Sim | Sim | Sim |

O servidor **não deve** aceitar \`recipient_id\`, \`event_kind\`,
\`required_module\` nem \`source_key\` fornecidos como autoridade pelo cliente.
Destinatários deverão ser recalculados a partir de fatos canônicos das tabelas
operacionais e das permissões vigentes antes de registrar ou enviar qualquer notificação.

A RLS verifica \`auth.uid() = recipient_id\`, módulos \`hub_os\` e
\`required_module\` via \`public.has_module_access\`, data de expiração e
se a OS foi arquivada. O CHECK impede classificar aviso de Produção como
permissão apenas comercial. Marcações por \`UPDATE\` limitadas à coluna \`read_at\`;
\`INSERT\`, \`DELETE\` e troca de destinatário são proibidos ao navegador.

## Avaliação de ameaças e limitações da proposta

1. **Falsificação de evento**: esta migration não produz eventos. Criar triggers
   futuros a partir de \`os_orders\`, \`os_order_assignees\` e \`os_installations\`;
   nunca da auditoria \`os_orders_event\` isoladamente.
2. **Outro usuário/aparelho**: \`endpoint_hash\` globalmente único. A API
   posterior deverá comprovar o registro no aparelho atual, impedir takeover
   indevido e desvincular inscrições no logout e na troca de conta.
3. **SSRF/URLs de push**: o CHECK de HTTPS é apenas defensivo, não valida destino.
   O backend deverá usar allowlist de serviços Web Push confiáveis e bloquear
   redes internas, endereços especiais e redirecionamentos não autorizados.
4. **Metadados de notificações**: \`user_notifications\` tem \`kind\`,
   \`required_module\` e \`resource_id\`; sem texto de clientes/endereços.
   O worker mostra aviso genérico na tela bloqueada.
5. **Envio duplicado**: três níveis de \`UNIQUE\` (fonte, destinatário, aparelho);
   o futuro worker também deve usar lease com \`FOR UPDATE SKIP LOCKED\`,
   limites, retries e idempotência.
6. **RLS ≠ autenticação do endpoint**: funções backend usarão JWT validado
   pelo Supabase Auth; service role jamais é exposto ao cliente. O usuário
   não tem acesso à tabela privada por REST.
7. **Retenção**: as FK entre histórico e outbox exigem manter eventos fonte
   enquanto houver histórico de 30 dias. A política de limpeza e manutenção
   deve ser implementada depois, de forma transacional, antes da produção.
8. **Política de módulos**: a RLS da central usa módulo corrente do usuário.
   Eventos de gestão, audiências por cargo e atribuições futuras ainda deverão
   ter validação específica no servidor, não basta um grant no banco.
9. **Disponibilidade**: se as regras RLS falharem, deve prevalecer falta de
   notificação, nunca acesso indevido.

## Testes preparados

**Vitest estático (roda no GitHub Actions, não consulta o Supabase):**
RLS e REVOKE; grants mínimos; unicidade; ausência de cron/trigger/funcão;
branch sem preview; existência dos testes pgTAP.

**pgTAP transacional (não executado nesta etapa):**
43 verificações para 4 tabelas, RLS, grants, permissão de coluna, schema
privado, existência de políticas com \`auth.uid()\`, unicidade, ausência
de triggers e funções de despacho.

Na futura etapa autorizada de homologação também executar cenários dinâmicos
com JWTs reais de dois usuários descartáveis: leitura de outro destinatário,
revogação de módulo, OS arquivada, tentativa de UPDATE de \`recipient_id\`,
INSERT/DELETE do histórico, tentativa de acessar endpoint privado e
aplicação simultânea de dois eventos iguais.

## Gates obrigatórios antes de aplicar

1. Revisar SQL, políticas, permissões de esquema, Data API exposto, escopo
   de usuários e impactos em ferramentas que usam \`public\`.
2. Conferir que a migration não colide com novas alterações de \`main\`.
3. Preparar um ambiente local/homologação autorizado e executar pgTAP,
   testes dinâmicos com identidades fictícias e verificações de segurança.
4. Coletar autorização explícita para **aplicar migrations**.
5. Uma autorização distinta será necessária para **ativar qualquer Push**;
   manter as futuras flags de registro/geração/envio desligadas.
6. Uma autorização distinta será necessária para **merge/publicação**.

## Plano de reversão (somente se aprovado futuramente)

Por ser infraestrutura nova, pode-se fazer rollback das tabelas apenas
enquanto estiverem vazias e sem integrações ativas. Após uso real,
reversão exige preservar histórico e auditoria; primeiro desabilitar envio e
cadastro, depois elaborar migration reversa revisada. Não executar
\`DROP ... CASCADE\` no projeto real.

**Estado atual:** SQL preparado em GitHub; **não executado** contra Supabase.
