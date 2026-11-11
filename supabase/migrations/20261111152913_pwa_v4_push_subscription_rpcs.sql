-- PWA V4 / Etapa 2C — API autenticada de inscrição (não aplicar sem autorização).
-- A inscrição continua DESABILITADA por padrão na Vercel.
-- Requer migration aplicada: 20261111105940_pwa_v4_push_schema_foundation.
--
-- A API usa service_role somente no servidor e invoca estas funções.
-- NÃO expor schema private no Data API nem conceder EXECUTE a anon/authenticated.
-- Não há cron, trigger, evento, envio push ou chave VAPID nesta migration.

create or replace function public.push_v4_register_subscription(
  p_user_id uuid,
  p_endpoint_hash text,
  p_endpoint text,
  p_p256dh text,
  p_auth_secret text
)
returns text
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_bound_user uuid;
begin
  if p_user_id is null
     or p_endpoint_hash is null
     or p_endpoint_hash !~ '^[0-9a-f]{64}$'
     or p_endpoint is null
     or length(p_endpoint) not between 32 and 2048
     or p_endpoint not like 'https://%'
     or p_p256dh is null
     or length(p_p256dh) not between 16 and 256
     or p_auth_secret is null
     or length(p_auth_secret) not between 8 and 256
  then
    return 'invalid';
  end if;

  -- A verificação real de origem HTTPS/allowlist, SHA e chaves fica na API.
  -- Este segundo gate protege contra chamadas usando credenciais de serviço
  -- que tentem registrar pessoas sem acesso vigente ao Hub.
  if not public.has_module_access(p_user_id, 'hub_os') then
    return 'forbidden';
  end if;

  -- Serializa inscrições concorrentes do mesmo usuário, incluindo o limite.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 441901)
  );

  select s.user_id into v_bound_user
  from private.push_subscriptions s
  where s.endpoint_hash = p_endpoint_hash
  for update;

  if found then
    if v_bound_user <> p_user_id then
      -- Nunca transferir automaticamente endpoint ligado a outra conta,
      -- inclusive quando revogado; exigir novo registro do navegador.
      return 'endpoint_bound';
    end if;

    update private.push_subscriptions
    set endpoint = p_endpoint,
        p256dh = p_p256dh,
        auth_secret = p_auth_secret,
        revoked_at = null,
        failure_count = 0,
        last_seen_at = pg_catalog.now()
    where endpoint_hash = p_endpoint_hash
      and user_id = p_user_id;

    return 'registered';
  end if;

  if (select count(*) from private.push_subscriptions
      where user_id = p_user_id and revoked_at is null) >= 5
  then
    return 'device_limit';
  end if;

  insert into private.push_subscriptions (
    user_id, endpoint_hash, endpoint, p256dh, auth_secret
  ) values (
    p_user_id, p_endpoint_hash, p_endpoint, p_p256dh, p_auth_secret
  );

  return 'registered';
exception
  when unique_violation then
    -- Concorrência entre contas ou duplicidade inesperada: falha fechada.
    return 'endpoint_bound';
end;
$$;

create or replace function public.push_v4_revoke_subscription(
  p_user_id uuid,
  p_endpoint_hash text
)
returns boolean
language plpgsql security invoker
set search_path = ''
as $$
begin
  if p_user_id is null
     or p_endpoint_hash is null
     or p_endpoint_hash !~ '^[0-9a-f]{64}$'
  then
    return false;
  end if;

  update private.push_subscriptions
  set revoked_at = pg_catalog.now()
  where user_id = p_user_id
    and endpoint_hash = p_endpoint_hash
    and revoked_at is null;

  return found;
end;
$$;

create or replace function public.push_v4_subscription_status(
  p_user_id uuid,
  p_endpoint_hash text
)
returns boolean
language sql stable security invoker
set search_path = ''
as $$
  select p_user_id is not null
     and p_endpoint_hash ~ '^[0-9a-f]{64}$'
     and exists (
       select 1 from private.push_subscriptions s
       where s.user_id = p_user_id
         and s.endpoint_hash = p_endpoint_hash
         and s.revoked_at is null
     );
$$;

-- Revoga o EXECUTE público padrão em todas as três funções antes de permitir
-- APENAS a conexão privilegiada do servidor.
revoke all on function public.push_v4_register_subscription(uuid,text,text,text,text)
  from public, anon, authenticated;
revoke all on function public.push_v4_revoke_subscription(uuid,text)
  from public, anon, authenticated;
revoke all on function public.push_v4_subscription_status(uuid,text)
  from public, anon, authenticated;

grant execute on function public.push_v4_register_subscription(uuid,text,text,text,text)
  to service_role;
grant execute on function public.push_v4_revoke_subscription(uuid,text)
  to service_role;
grant execute on function public.push_v4_subscription_status(uuid,text)
  to service_role;

-- NADA é ativado pela migration:
-- - Registro: PWA_PUSH_REGISTRATION_ENABLED=false por padrão no código
-- - Geração e envio: não implementados, sem triggers/cron/VAPID definidos
