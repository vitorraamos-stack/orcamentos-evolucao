-- Evolução OS 2.0 — Hotfix 4.1c: the deadline saved on the OS is authoritative.

create or replace function public.hub_os_add_business_days(
  p_start_date date,
  p_business_days integer
)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  v_date date := p_start_date;
  v_remaining integer := p_business_days;
begin
  if p_start_date is null or p_business_days is null or p_business_days < 0 then
    raise exception 'Data inicial e quantidade não negativa de dias úteis são obrigatórias.' using errcode = '22023';
  end if;

  while v_remaining > 0 loop
    v_date := v_date + 1;
    if extract(isodow from v_date) < 6 then
      v_remaining := v_remaining - 1;
    end if;
  end loop;
  return v_date;
end;
$$;

revoke all on function public.hub_os_add_business_days(date,integer) from public, anon, authenticated;

-- The three deadline arguments remain only for PostgREST compatibility. They
-- are deprecated and intentionally ignored; do not add an overload.
create or replace function public.hub_os_send_to_production_secure(
  p_os_id uuid,
  p_delivery_deadline_started_at timestamptz,
  p_delivery_date date,
  p_delivery_deadline_preset text,
  p_event_payload jsonb default '{}'::jsonb
)
returns public.os_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.hub_os_assert_orders_access();
  v_role text;
  v_order public.os_orders;
  v_updated public.os_orders;
  v_payload jsonb;
  v_started_at timestamptz := now();
  v_delivery_date date;
begin
  select p.role into v_role from public.profiles p where p.id = v_uid;
  if v_role is null or v_role not in ('admin', 'gerente', 'arte_finalista') then
    raise exception 'Usuário não autorizado para enviar a OS à Produção.' using errcode = '42501';
  end if;

  select * into v_order from public.os_orders o where o.id = p_os_id for update;
  if v_order.id is null then
    raise exception 'OS não encontrada.' using errcode = 'P0002';
  end if;
  if coalesce(v_order.archived, false) or v_order.prod_status = 'Finalizados' then
    raise exception 'OS finalizada/arquivada não pode iniciar Produção.' using errcode = '22023';
  end if;
  if v_order.art_status <> 'Para Aprovação' or v_order.prod_status is not null then
    raise exception 'A OS deve estar em Para Aprovação e fora da Produção.' using errcode = '22023';
  end if;
  if v_order.delivery_deadline_preset is null then
    raise exception 'OS sem prazo de produção definido.' using errcode = '22023';
  end if;

  v_delivery_date := case v_order.delivery_deadline_preset
    when 'FAST_5_8' then public.hub_os_add_business_days(v_started_at::date, 8)
    when 'STANDARD_8_12' then public.hub_os_add_business_days(v_started_at::date, 12)
    when 'STRUCTURE_INSTALL_15_25' then public.hub_os_add_business_days(v_started_at::date, 25)
    when 'CUSTOM' then v_order.delivery_date
    else null
  end;

  if v_order.delivery_deadline_preset = 'CUSTOM' and v_delivery_date is null then
    raise exception 'OS com prazo personalizado sem data definida.' using errcode = '22023';
  end if;
  if v_delivery_date is null then
    raise exception 'Preset de prazo inválido na OS.' using errcode = '22023';
  end if;

  update public.os_orders o
  set art_status = 'Produzir', prod_status = 'Produção',
      delivery_deadline_started_at = v_started_at,
      delivery_date = v_delivery_date, updated_by = v_uid, updated_at = v_started_at
  where o.id = p_os_id returning * into v_updated;

  v_payload := (coalesce(p_event_payload, '{}'::jsonb)
    - array['board', 'from', 'to', 'actor', 'production_started',
            'delivery_deadline_preset', 'delivery_deadline_started_at', 'delivery_date'])
    || jsonb_build_object(
      'board', 'art', 'from', v_order.art_status, 'to', 'Produzir',
      'actor', v_uid, 'production_started', true,
      'delivery_deadline_preset', v_order.delivery_deadline_preset,
      'delivery_deadline_started_at', v_started_at,
      'delivery_date', v_delivery_date
    );
  insert into public.os_orders_event (os_id, type, payload, created_by, created_at)
  values (p_os_id, 'status_change', v_payload, v_uid, v_started_at);
  return v_updated;
end;
$$;

revoke all on function public.hub_os_send_to_production_secure(uuid,timestamptz,date,text,jsonb) from public;
revoke execute on function public.hub_os_send_to_production_secure(uuid,timestamptz,date,text,jsonb) from anon;
grant execute on function public.hub_os_send_to_production_secure(uuid,timestamptz,date,text,jsonb) to authenticated;
