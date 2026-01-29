# Agendamento da sincronização Conta Azul via Supabase

Este guia substitui o Vercel Cron (incompatível com o plano Hobby para execuções frequentes) por um agendamento no Supabase usando `pg_cron` + `pg_net`.

## Pré-requisitos

- Projeto Supabase com acesso ao SQL Editor.
- Endpoint serverless disponível em **`/api/conta-azul/sync`** (POST) protegido pelo header `x-cron-secret`.
- Variáveis sensíveis **apenas no servidor** (Vercel/Supabase Vault):
  - `CONTA_AZUL_CLIENT_SECRET`, `CONTA_AZUL_CRON_SECRET`, refresh token e `service_role`.

## Passo a passo

1. **Habilite as extensões** no Supabase:

   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   ```

2. **Cadastre os segredos no Vault**:

   - `vercel_sync_url`: `https://SEU-DOMINIO.vercel.app/api/conta-azul/sync`
   - `cron_secret`: mesmo valor de `CONTA_AZUL_CRON_SECRET`

3. **Crie o agendamento** (a cada 5 minutos) executando o SQL abaixo ou rodando o arquivo `supabase/conta_azul_cron.sql`:

   ```sql
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
   ```

## Validação

- Confirme que o endpoint responde com `200` ao receber o header `x-cron-secret` correto.
- Consulte o histórico do `pg_cron` (`cron.job_run_details`) para verificar execuções.

## Observações

- O deploy na Vercel **não depende** de cron jobs.
- O endpoint `/api/conta-azul/sync` permanece server-side e protegido por segredo.
- Nunca exponha `CONTA_AZUL_CLIENT_SECRET`, refresh token ou `service_role` no client.
