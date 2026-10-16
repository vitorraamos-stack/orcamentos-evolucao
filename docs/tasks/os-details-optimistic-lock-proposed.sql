-- EVOLUSYSTEM / PROPOSTA - NAO EXECUTADA
--
-- Deployment ORDER (requires specific authorization):
--  1. Review permissions and current public.hub_os_update_order_secure contract.
--  2. Apply this additive SQL on the intended Evolucao Supabase project.
--  3. Read-only verify function signature and EXECUTE grants, plus security advisors.
--  4. Only then authorize/merge the companion client PR.
--
-- This does not replace the existing RPC used by other modules.
-- Existing role checks, field allowlist, writing rules and event transaction
-- remain in public.hub_os_update_order_secure.
--
-- An authenticated manager may call this RPC: permission is checked BEFORE
-- taking the row lock and rechecked by the existing secure function.
-- Lock + comparison + underlying update are part of ONE database transaction.

create or replace function public.hub_os_update_order_if_current(
  p_os_id uuid,
  p_patch jsonb,
  p_expected_updated_at timestamptz,
  p_event_type text default null,
  p_event_payload jsonb default '{}'::jsonb
)
returns public.os_orders
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := public.hub_os_assert_orders_access();
  v_role text;
  v_current_updated_at timestamptz;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = v_uid;

  if v_role is null or v_role not in ('admin', 'gerente') then
    raise exception 'Apenas gerente/admin podem editar a OS.'
      using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'Versao original da OS obrigatoria.'
      using errcode = '22023';
  end if;

  select o.updated_at
  into v_current_updated_at
  from public.os_orders o
  where o.id = p_os_id
  for update;

  if not found then
    raise exception 'OS não encontrada.' using errcode = 'P0002';
  end if;

  if v_current_updated_at is distinct from p_expected_updated_at then
    raise exception
      'Esta OS foi alterada por outro colaborador. Seu texto nao foi salvo. Copie as alteracoes e reabra a OS para conferir os dados atuais.'
      using errcode = 'P0001';
  end if;

  -- Authoritative allowlist + audit event stay in the existing secure function.
  -- Calling it under the same transaction preserves atomicity of the check.
  return public.hub_os_update_order_secure(
    p_os_id, p_patch, p_event_type, p_event_payload
  );
end;
$function$;

-- Functions are executable by PUBLIC by default, including via inherited role.
revoke all on function public.hub_os_update_order_if_current(uuid,jsonb,timestamptz,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.hub_os_update_order_if_current(uuid,jsonb,timestamptz,text,jsonb)
  to authenticated;

comment on function public.hub_os_update_order_if_current(uuid,jsonb,timestamptz,text,jsonb)
  is 'EvoluSystem: conditional OS update with row lock and revision check; manager only. Delegates to hub_os_update_order_secure.';
