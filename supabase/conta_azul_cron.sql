-- Agendamento do polling via pg_cron + pg_net (Supabase)
-- Pré-requisitos:
-- 1) Ative as extensões pg_cron e pg_net no projeto Supabase.
-- 2) Configure os secrets no Vault:
--    - vercel_sync_url: https://SEU-DOMINIO.vercel.app/api/conta-azul/sync
--    - cron_secret: CONTA_AZUL_CRON_SECRET

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'conta-azul-sync',
  '*/5 * * * *',
  $$
  select
    net.http_post(
      url := (select vault.get_secret('vercel_sync_url')),
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-cron-secret', (select vault.get_secret('cron_secret'))
      ),
      body := jsonb_build_object('source', 'supabase-cron')
    );
  $$
);
