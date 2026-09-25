-- Evolução OS 2.0 — Fase 3.1: boards escaláveis, handoff completo e Realtime.

-- Publication changes are idempotent and do not alter the tables' existing RLS.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'os_orders',
    'os_order_assignees',
    'os_order_items',
    'os_order_deadlines',
    'os_order_comments'
  ] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

-- Remove the prior contract first so PostgREST cannot see ambiguous overloads.
revoke execute on function public.hub_os_send_to_production_secure(uuid,timestamptz,date,jsonb) from public, anon, authenticated;
drop function public.hub_os_send_to_production_secure(uuid,timestamptz,date,jsonb);

create function public.hub_os_send_to_production_secure(
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
begin
  select p.role into v_role from public.profiles p where p.id = v_uid;
  if v_role is null or v_role not in ('admin', 'gerente', 'arte_finalista') then
    raise exception 'Usuário não autorizado para enviar a OS à Produção.' using errcode = '42501';
  end if;

  if p_delivery_deadline_preset is null or p_delivery_deadline_preset not in (
    'FAST_5_8', 'STANDARD_8_12', 'STRUCTURE_INSTALL_15_25', 'CUSTOM'
  ) then
    raise exception 'Preset de prazo inválido.' using errcode = '22023';
  end if;
  if p_delivery_deadline_started_at is null or p_delivery_date is null then
    raise exception 'Início e data final do prazo são obrigatórios.' using errcode = '22023';
  end if;
  if p_delivery_deadline_preset = 'CUSTOM' and p_delivery_date is null then
    raise exception 'Data final é obrigatória para prazo personalizado.' using errcode = '22023';
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

  update public.os_orders o
  set art_status = 'Produzir', prod_status = 'Produção',
      delivery_deadline_preset = p_delivery_deadline_preset,
      delivery_deadline_started_at = p_delivery_deadline_started_at,
      delivery_date = p_delivery_date, updated_by = v_uid, updated_at = now()
  where o.id = p_os_id returning * into v_updated;

  v_payload := (coalesce(p_event_payload, '{}'::jsonb)
    - array['board', 'from', 'to', 'actor', 'production_started',
            'delivery_deadline_preset', 'delivery_deadline_started_at', 'delivery_date'])
    || jsonb_build_object(
      'board', 'art', 'from', v_order.art_status, 'to', 'Produzir',
      'actor', v_uid, 'production_started', true,
      'delivery_deadline_preset', p_delivery_deadline_preset,
      'delivery_deadline_started_at', p_delivery_deadline_started_at,
      'delivery_date', p_delivery_date
    );
  insert into public.os_orders_event (os_id, type, payload, created_by, created_at)
  values (p_os_id, 'status_change', v_payload, v_uid, now());
  return v_updated;
end;
$$;

revoke all on function public.hub_os_send_to_production_secure(uuid,timestamptz,date,text,jsonb) from public;
revoke execute on function public.hub_os_send_to_production_secure(uuid,timestamptz,date,text,jsonb) from anon;
grant execute on function public.hub_os_send_to_production_secure(uuid,timestamptz,date,text,jsonb) to authenticated;
