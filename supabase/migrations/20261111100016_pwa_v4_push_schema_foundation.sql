-- EvoluSystem PWA V4 — proposta de schema e RLS; NÃO APLICAR SEM AUTORIZAÇÃO.
-- Etapa 2B: somente estruturas, índices e grants. NÃO cria triggers de eventos,
-- não agenda cron, não registra dispositivos e não habilita Web Push.
-- Preparado em branch isolada; aplicar só após auditoria e autorização específica.
--
-- Observação: public.has_module_access(uuid,text) já existe no projeto.
-- O esquema private não deve ser exposto no Data API do Supabase.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

-- 1/4: fonte canônica de futuros eventos, sem conteúdo sensível de cliente.
create table private.notification_source_outbox (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique
    check (length(source_key) between 8 and 200),
  event_kind text not null check (event_kind in (
    'assignment',
    'art_inbox',
    'production_released',
    'installation_scheduled',
    'installation_rescheduled'
  )),
  source_table text not null check (source_table in (
    'os_orders',
    'os_order_assignees',
    'os_installations'
  )),
  source_object_id uuid not null,
  order_id uuid not null references public.os_orders(id) on delete cascade,
  recipient_hint_id uuid null references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  state text not null default 'pending' check (state in (
    'pending', 'processing', 'completed', 'discarded', 'failed'
  )),
  attempt_count integer not null default 0
    check (attempt_count between 0 and 20),
  retry_at timestamptz not null default now(),
  lease_until timestamptz null,
  last_error_code text null check (
    last_error_code is null or length(last_error_code) <= 100
  )
);
create index notification_source_outbox_dispatch_idx
  on private.notification_source_outbox(state, retry_at, recorded_at)
  where state in ('pending', 'processing', 'failed');
create index notification_source_outbox_order_idx
  on private.notification_source_outbox(order_id, recorded_at desc);

-- 2/4: histórico pessoal. O cliente pode somente LER e MARCAR read_at.
-- Um aviso nunca pode ampliar seu próprio módulo: required_module é fixado
-- pelo backend e validado por CHECK. Revogação de módulo revoga leitura.
create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  source_event_id uuid not null
    references private.notification_source_outbox(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in (
    'assignment',
    'art_inbox',
    'production_released',
    'installation_scheduled',
    'installation_rescheduled'
  )),
  required_module text not null check (required_module in (
    'hub_os',
    'hub_os_arte',
    'hub_os_producao',
    'hub_os_instalacoes'
  )),
  resource_id uuid not null references public.os_orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  read_at timestamptz null,
  constraint user_notifications_kind_module_ck check (
    (kind = 'assignment' and required_module in (
      'hub_os', 'hub_os_arte', 'hub_os_producao', 'hub_os_instalacoes'
    ))
    or (kind = 'art_inbox' and required_module = 'hub_os_arte')
    or (kind = 'production_released' and required_module = 'hub_os_producao')
    or (
      kind in ('installation_scheduled', 'installation_rescheduled')
      and required_module = 'hub_os_instalacoes'
    )
  ),
  constraint user_notifications_expiration_ck check (expires_at > created_at),
  constraint user_notifications_read_at_ck check (
    read_at is null or read_at >= created_at
  ),
  constraint user_notifications_source_recipient_unique
    unique (source_event_id, recipient_id)
);
create index user_notifications_recipient_recent_idx
  on public.user_notifications(recipient_id, created_at desc);
create index user_notifications_recipient_unread_idx
  on public.user_notifications(recipient_id, created_at desc)
  where read_at is null;

-- 3/4: endpoints e chaves de inscrição ficam fora do Data API público.
-- endpoint_hash tem unicidade GLOBAL: um dispositivo jamais pode ficar
-- associado simultaneamente a dois usuários por endpoints distintos iguais.
-- O servidor deverá validar destino HTTPS / allowlist e prova de inscrição.
create table private.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint_hash text not null unique
    check (endpoint_hash ~ '^[0-9a-f]{64}$'),
  endpoint text not null check (
    endpoint like 'https://%' and length(endpoint) between 32 and 2048
  ),
  p256dh text not null check (length(p256dh) between 16 and 256),
  auth_secret text not null check (length(auth_secret) between 8 and 256),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_success_at timestamptz null,
  revoked_at timestamptz null,
  failure_count integer not null default 0
    check (failure_count between 0 and 100)
);
create index push_subscriptions_active_user_idx
  on private.push_subscriptions(user_id, last_seen_at desc)
  where revoked_at is null;

-- 4/4: entrega idempotente por aviso/dispositivo, para fila futura.
create table private.push_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null
    references public.user_notifications(id) on delete cascade,
  subscription_id uuid not null
    references private.push_subscriptions(id) on delete cascade,
  status text not null default 'pending' check (status in (
    'pending', 'processing', 'retry', 'sent', 'discarded', 'failed'
  )),
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz null,
  last_http_status integer null check (
    last_http_status is null or last_http_status between 100 and 599
  ),
  last_error_code text null check (
    last_error_code is null or length(last_error_code) <= 100
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_delivery_jobs_once unique (notification_id, subscription_id)
);
create index push_delivery_jobs_claim_idx
  on private.push_delivery_jobs(status, next_attempt_at, created_at)
  where status in ('pending', 'retry', 'processing');

-- RLS é habilitado em TODAS as tabelas novas. As privadas não recebem
-- nenhuma política para anon/autenticado e não são expostas via esquema.
alter table private.notification_source_outbox enable row level security;
alter table private.push_subscriptions enable row level security;
alter table private.push_delivery_jobs enable row level security;
alter table public.user_notifications enable row level security;

-- Revoga grants automáticos do projeto Supabase: RLS não substitui GRANT.
revoke all on table private.notification_source_outbox
  from public, anon, authenticated, service_role;
revoke all on table private.push_subscriptions
  from public, anon, authenticated, service_role;
revoke all on table private.push_delivery_jobs
  from public, anon, authenticated, service_role;
revoke all on table public.user_notifications
  from public, anon, authenticated, service_role;

-- Somente backend de confiança terá acesso às estruturas de processamento.
grant select, insert, update, delete on private.notification_source_outbox
  to service_role;
grant select, insert, update, delete on private.push_subscriptions
  to service_role;
grant select, insert, update, delete on private.push_delivery_jobs
  to service_role;
grant select, insert, update, delete on public.user_notifications
  to service_role;

-- O aplicativo usa RLS e só altera a coluna de leitura.
grant select on public.user_notifications to authenticated;
grant update (read_at) on public.user_notifications to authenticated;

create policy "user_notifications_select_own_authorized"
  on public.user_notifications
  for select to authenticated
  using (
    recipient_id = (select auth.uid())
    and public.has_module_access((select auth.uid()), 'hub_os')
    and public.has_module_access((select auth.uid()), required_module)
    and expires_at > now()
    and exists (
      select 1 from public.os_orders o
       where o.id = resource_id and coalesce(o.archived, false) = false
    )
  );

create policy "user_notifications_update_read_at_own_authorized"
  on public.user_notifications
  for update to authenticated
  using (
    recipient_id = (select auth.uid())
    and public.has_module_access((select auth.uid()), 'hub_os')
    and public.has_module_access((select auth.uid()), required_module)
    and expires_at > now()
    and exists (
      select 1 from public.os_orders o
       where o.id = resource_id and coalesce(o.archived, false) = false
    )
  )
  with check (
    recipient_id = (select auth.uid())
    and public.has_module_access((select auth.uid()), 'hub_os')
    and public.has_module_access((select auth.uid()), required_module)
    and expires_at > now()
    and exists (
      select 1 from public.os_orders o
       where o.id = resource_id and coalesce(o.archived, false) = false
    )
  );

-- Sem policies INSERT/DELETE para autenticado e sem acesso de anon.
-- Sem gatilho de evento, cron, RLS permissiva, API, segredo ou envio de Push.
