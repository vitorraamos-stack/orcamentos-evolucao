-- EVOLUSYSTEM / PROPOSTA — NAO APLICAR SEM AUTORIZACAO ESPECIFICA.
-- Protects management cards: one row per (order_id, scope), including
-- concurrently created/removed rows. No table, RLS or legacy RPC changes.
--
-- The order-row lock coordinates the *new* RPCs, including absent child rows.
-- The child-row lock checks the revision and serializes with regular UPDATEs.
-- Existing direct mutations elsewhere must be migrated separately.
-- These functions are management-only and audit in the SAME transaction.

create or replace function public.hub_os_set_assignee_if_current(
  p_os_id uuid,
  p_scope text,
  p_user_id uuid,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := public.hub_os_assert_orders_access();
  v_role text;
  v_existing public.os_order_assignees%rowtype;
  v_found boolean;
  v_updated public.os_order_assignees%rowtype;
begin
  select p.role into v_role from public.profiles p where p.id = v_uid;
  if v_role is null or v_role not in ('admin', 'gerente') then
    raise exception 'Apenas gerente/admin podem alterar responsáveis.' using errcode='42501';
  end if;
  if p_scope is null or p_scope not in ('GENERAL','ART','PRODUCTION','FINISHING','INSTALLATION') then
    raise exception 'Etapa de responsável inválida.' using errcode='22023';
  end if;

  -- Also serializes creates for scopes that do not have a child row yet.
  perform 1 from public.os_orders o where o.id = p_os_id for update;
  if not found then raise exception 'OS não encontrada.' using errcode='P0002'; end if;

  select * into v_existing from public.os_order_assignees a
  where a.order_id=p_os_id and a.scope=p_scope for update;
  v_found := found;
  if (v_found and (p_expected_updated_at is null or v_existing.updated_at is distinct from p_expected_updated_at))
     or (not v_found and p_expected_updated_at is not null) then
    raise exception 'O responsável desta etapa foi alterado. Recarregue a OS antes de tentar novamente.'
      using errcode='P0001';
  end if;

  if p_user_id is null then
    if not v_found then return null; end if;
    delete from public.os_order_assignees a where a.id=v_existing.id;
  else
    if v_found then
      update public.os_order_assignees a set user_id=p_user_id
      where a.id=v_existing.id returning * into v_updated;
    else
      insert into public.os_order_assignees (order_id,scope,user_id)
      values (p_os_id,p_scope,p_user_id) returning * into v_updated;
    end if;
  end if;

  insert into public.os_orders_event (os_id,type,payload,created_by,created_at)
  values (p_os_id,'assignee_changed',
    jsonb_build_object('scope',p_scope,
      'from',case when v_found then v_existing.user_id else null end,
      'to',p_user_id),v_uid,now());
  if p_user_id is null then return null; end if;
  return to_jsonb(v_updated);
end;
$function$;

create or replace function public.hub_os_set_deadline_if_current(
  p_os_id uuid,
  p_scope text,
  p_action text,
  p_due_date date,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := public.hub_os_assert_orders_access();
  v_role text;
  v_existing public.os_order_deadlines%rowtype;
  v_found boolean;
  v_updated public.os_order_deadlines%rowtype;
  v_event_type text;
  v_event_payload jsonb;
begin
  select p.role into v_role from public.profiles p where p.id = v_uid;
  if v_role is null or v_role not in ('admin', 'gerente') then
    raise exception 'Apenas gerente/admin podem alterar prazos.' using errcode='42501';
  end if;
  if p_scope is null or p_scope not in ('ART','APPROVAL','PRODUCTION','FINISHING','INSTALLATION') then
    raise exception 'Etapa de prazo inválida.' using errcode='22023';
  end if;
  if p_action is null or p_action not in ('set','complete','reopen','remove') then
    raise exception 'Ação de prazo inválida.' using errcode='22023';
  end if;
  if p_action = 'set' and p_due_date is null then
    raise exception 'Informe uma data válida.' using errcode='22023';
  end if;

  perform 1 from public.os_orders o where o.id=p_os_id for update;
  if not found then raise exception 'OS não encontrada.' using errcode='P0002'; end if;

  select * into v_existing from public.os_order_deadlines d
  where d.order_id=p_os_id and d.scope=p_scope for update;
  v_found := found;
  if (v_found and (p_expected_updated_at is null or v_existing.updated_at is distinct from p_expected_updated_at))
     or (not v_found and p_expected_updated_at is not null) then
    raise exception 'A meta desta etapa foi alterada. Recarregue a OS antes de tentar novamente.'
      using errcode='P0001';
  end if;
  if p_action <> 'set' and not v_found then
    raise exception 'Meta interna não encontrada. Recarregue a OS.' using errcode='P0002';
  end if;

  if p_action='set' then
    if v_found then
      update public.os_order_deadlines d set due_date=p_due_date,completed_at=null
      where d.id=v_existing.id returning * into v_updated;
    else
      insert into public.os_order_deadlines (order_id,scope,due_date,completed_at)
      values (p_os_id,p_scope,p_due_date,null) returning * into v_updated;
    end if;
    v_event_type:='deadline_changed';
    v_event_payload:=jsonb_build_object('scope',p_scope,
      'from',case when v_found then v_existing.due_date else null end,
      'to',p_due_date,'due_date',p_due_date);
  elsif p_action='complete' then
    update public.os_order_deadlines d set completed_at=now()
    where d.id=v_existing.id returning * into v_updated;
    v_event_type:='deadline_completed';
    v_event_payload:=jsonb_build_object('scope',p_scope,'due_date',v_existing.due_date);
  elsif p_action='reopen' then
    update public.os_order_deadlines d set completed_at=null
    where d.id=v_existing.id returning * into v_updated;
    v_event_type:='deadline_reopened';
    v_event_payload:=jsonb_build_object('scope',p_scope,'due_date',v_existing.due_date);
  else
    delete from public.os_order_deadlines d where d.id=v_existing.id;
    v_event_type:='deadline_removed';
    v_event_payload:=jsonb_build_object('scope',p_scope,'due_date',v_existing.due_date);
  end if;

  insert into public.os_orders_event (os_id,type,payload,created_by,created_at)
  values (p_os_id,v_event_type,v_event_payload,v_uid,now());
  if p_action='remove' then return null; end if;
  return to_jsonb(v_updated);
end;
$function$;

-- New SECURITY DEFINER RPCs: never give implicit PUBLIC/anon EXECUTE.
revoke all on function public.hub_os_set_assignee_if_current(uuid,text,uuid,timestamptz)
  from public,anon,authenticated;
grant execute on function public.hub_os_set_assignee_if_current(uuid,text,uuid,timestamptz)
  to authenticated;
revoke all on function public.hub_os_set_deadline_if_current(uuid,text,text,date,timestamptz)
  from public,anon,authenticated;
grant execute on function public.hub_os_set_deadline_if_current(uuid,text,text,date,timestamptz)
  to authenticated;

comment on function public.hub_os_set_assignee_if_current(uuid,text,uuid,timestamptz)
  is 'Manager-only optimistic lock for OS scoped assignee with transactional audit.';
comment on function public.hub_os_set_deadline_if_current(uuid,text,text,date,timestamptz)
  is 'Manager-only optimistic lock for OS scoped deadlines with transactional audit.';
