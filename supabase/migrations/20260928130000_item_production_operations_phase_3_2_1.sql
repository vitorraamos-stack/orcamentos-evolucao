-- Evolução OS 2.0 — Fase 3.2.1: production operations belong to items, not board columns.
create table public.os_order_item_operations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.os_order_items(id) on delete cascade,
  work_center text not null check (work_center in ('PRINTING','METALWORK','ASSEMBLY','CHANNEL_LETTER','ELECTRICAL_LIGHTING','EXTERNAL_PRODUCTION','FINISHING_QC')),
  status text not null default 'PENDING' check (status in ('PENDING','IN_PROGRESS','COMPLETED','BLOCKED')),
  assigned_to uuid references public.profiles(id) on delete set null,
  is_required boolean not null default true,
  notes text check (notes is null or length(notes) <= 4000),
  blocked_reason text check (blocked_reason is null or length(blocked_reason) <= 1000),
  sort_order integer not null default 0 check (sort_order >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles(id), updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, deleted_by uuid references public.profiles(id),
  constraint operation_blocked_reason check (status <> 'BLOCKED' or nullif(trim(blocked_reason), '') is not null),
  constraint operation_completed_at check (status = 'COMPLETED' or completed_at is null),
  constraint operation_completed_has_date check (status <> 'COMPLETED' or completed_at is not null)
);
create index os_item_operations_item_active_idx on public.os_order_item_operations(item_id, sort_order) where deleted_at is null;
create index os_item_operations_assigned_active_idx on public.os_order_item_operations(assigned_to) where deleted_at is null and assigned_to is not null;
create index os_item_operations_status_active_idx on public.os_order_item_operations(status) where deleted_at is null;
create index os_item_operations_center_active_idx on public.os_order_item_operations(work_center) where deleted_at is null;
alter table public.os_order_item_operations enable row level security;
create policy "operations_read_hub" on public.os_order_item_operations for select to authenticated using (public.has_module_access(auth.uid(), 'hub_os'));
-- Mutations deliberately have no table policy: SECURITY DEFINER contracts are the write boundary.

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='os_order_item_operations') then
    alter publication supabase_realtime add table public.os_order_item_operations;
  end if;
end $$;

create or replace function public.hub_os_assert_operation_access(p_manager_only boolean default false)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_uid uuid := auth.uid(); v_role text;
begin
  if v_uid is null or not public.has_module_access(v_uid, 'hub_os') then raise exception 'Acesso ao Hub OS necessário.' using errcode='42501'; end if;
  select role into v_role from public.profiles where id=v_uid;
  if v_role not in ('admin','gerente','producao') or (p_manager_only and v_role not in ('admin','gerente')) then raise exception 'Usuário sem permissão para operações de Produção.' using errcode='42501'; end if;
  return v_uid;
end $$;

create or replace function public.hub_os_recompute_item_production_status(p_item_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_current text; v_total int; v_required int; v_completed int; v_started boolean;
begin
  select status into v_current from public.os_order_items where id=p_item_id and deleted_at is null for update;
  if v_current is null or v_current='CANCELLED' then return; end if;
  select count(*), count(*) filter(where is_required), count(*) filter(where is_required and status='COMPLETED'), bool_or(status in ('IN_PROGRESS','BLOCKED') or started_at is not null)
    into v_total,v_required,v_completed,v_started from public.os_order_item_operations where item_id=p_item_id and deleted_at is null;
  if v_total=0 then return;
  elsif v_required>0 and v_completed=v_required then v_current := 'READY';
  elsif coalesce(v_started,false) then v_current := 'IN_PROGRESS';
  else v_current := 'PENDING'; end if;
  update public.os_order_items set status=v_current, updated_at=now() where id=p_item_id;
end $$;

create or replace function public.hub_os_create_item_operation_secure(p_item_id uuid,p_work_center text,p_assigned_to uuid default null,p_is_required boolean default true,p_notes text default null,p_sort_order integer default 0)
returns public.os_order_item_operations language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=public.hub_os_assert_operation_access(); v_row public.os_order_item_operations; v_order uuid;
begin
  select order_id into v_order from public.os_order_items where id=p_item_id and deleted_at is null;
  if v_order is null then raise exception 'Item não encontrado.' using errcode='P0002'; end if;
  insert into public.os_order_item_operations(item_id,work_center,assigned_to,is_required,notes,sort_order,created_by,updated_by)
  values(p_item_id,p_work_center,p_assigned_to,coalesce(p_is_required,true),nullif(trim(p_notes),''),coalesce(p_sort_order,0),v_uid,v_uid) returning * into v_row;
  perform public.hub_os_recompute_item_production_status(p_item_id);
  insert into public.os_orders_event(os_id,type,payload,created_by) values(v_order,'ITEM_OPERATION_CREATED',jsonb_build_object('operation_id',v_row.id,'item_id',p_item_id,'work_center',p_work_center,'assigned_to',p_assigned_to),v_uid);
  return v_row;
end $$;

create or replace function public.hub_os_set_item_operation_status_secure(p_operation_id uuid,p_status text,p_blocked_reason text default null,p_notes text default null)
returns public.os_order_item_operations language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=public.hub_os_assert_operation_access(); v_role text; v_row public.os_order_item_operations; v_from text; v_order uuid;
begin
  select role into v_role from public.profiles where id=v_uid;
  select * into v_row from public.os_order_item_operations where id=p_operation_id and deleted_at is null for update;
  if v_row.id is null then raise exception 'Operação não encontrada.' using errcode='P0002'; end if;
  v_from:=v_row.status;
  if p_status not in ('PENDING','IN_PROGRESS','COMPLETED','BLOCKED') then raise exception 'Status de operação inválido.' using errcode='22023'; end if;
  if p_status='BLOCKED' and nullif(trim(p_blocked_reason),'') is null then raise exception 'Informe o motivo do bloqueio.' using errcode='22023'; end if;
  if v_from='COMPLETED' and p_status='IN_PROGRESS' and v_role not in ('admin','gerente') then raise exception 'Somente gerente/admin pode reabrir operação.' using errcode='42501'; end if;
  if not ((v_from='PENDING' and p_status in ('IN_PROGRESS','BLOCKED')) or (v_from='IN_PROGRESS' and p_status in ('COMPLETED','BLOCKED','PENDING')) or (v_from='BLOCKED' and p_status in ('PENDING','IN_PROGRESS')) or (v_from='COMPLETED' and p_status='IN_PROGRESS') or v_from=p_status) then raise exception 'Transição de operação inválida.' using errcode='22023'; end if;
  update public.os_order_item_operations set status=p_status, blocked_reason=case when p_status='BLOCKED' then trim(p_blocked_reason) else null end,
    notes=coalesce(nullif(trim(p_notes),''),notes), started_at=case when p_status='IN_PROGRESS' then coalesce(started_at,now()) else started_at end,
    completed_at=case when p_status='COMPLETED' then now() else null end, updated_by=v_uid,updated_at=now() where id=p_operation_id returning * into v_row;
  perform public.hub_os_recompute_item_production_status(v_row.item_id);
  select order_id into v_order from public.os_order_items where id=v_row.item_id;
  insert into public.os_orders_event(os_id,type,payload,created_by) values(v_order,'ITEM_OPERATION_STATUS_CHANGED',jsonb_build_object('operation_id',v_row.id,'item_id',v_row.item_id,'work_center',v_row.work_center,'assigned_to',v_row.assigned_to,'from_status',v_from,'to_status',p_status,'blocked_reason',v_row.blocked_reason),v_uid);
  return v_row;
end $$;

create or replace function public.hub_os_update_item_operation_secure(p_operation_id uuid,p_work_center text,p_assigned_to uuid default null,p_is_required boolean default true,p_notes text default null,p_sort_order integer default 0)
returns public.os_order_item_operations language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=public.hub_os_assert_operation_access(); v_row public.os_order_item_operations; v_order uuid;
begin
 update public.os_order_item_operations set work_center=p_work_center,assigned_to=p_assigned_to,is_required=coalesce(p_is_required,true),notes=nullif(trim(p_notes),''),sort_order=coalesce(p_sort_order,0),updated_by=v_uid,updated_at=now() where id=p_operation_id and deleted_at is null returning * into v_row;
 if v_row.id is null then raise exception 'Operação não encontrada.' using errcode='P0002'; end if;
 perform public.hub_os_recompute_item_production_status(v_row.item_id); select order_id into v_order from public.os_order_items where id=v_row.item_id;
 insert into public.os_orders_event(os_id,type,payload,created_by) values(v_order,'ITEM_OPERATION_UPDATED',jsonb_build_object('operation_id',v_row.id,'item_id',v_row.item_id,'work_center',v_row.work_center,'assigned_to',v_row.assigned_to),v_uid); return v_row;
end $$;

create or replace function public.hub_os_delete_item_operation_secure(p_operation_id uuid)
returns public.os_order_item_operations language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=public.hub_os_assert_operation_access(true); v_row public.os_order_item_operations; v_order uuid;
begin
 update public.os_order_item_operations set deleted_at=now(),deleted_by=v_uid,updated_by=v_uid,updated_at=now() where id=p_operation_id and deleted_at is null returning * into v_row;
 if v_row.id is null then raise exception 'Operação não encontrada.' using errcode='P0002'; end if;
 perform public.hub_os_recompute_item_production_status(v_row.item_id); select order_id into v_order from public.os_order_items where id=v_row.item_id;
 insert into public.os_orders_event(os_id,type,payload,created_by) values(v_order,'ITEM_OPERATION_DELETED',jsonb_build_object('operation_id',v_row.id,'item_id',v_row.item_id,'work_center',v_row.work_center,'assigned_to',v_row.assigned_to),v_uid); return v_row;
end $$;

-- Preserve the hardened Phase 2.2 contract and add only production-operation guards.
create or replace function public.hub_os_move_order_secure(p_os_id uuid,p_next_art_status text default null,p_next_prod_status text default null,p_event_payload jsonb default '{}'::jsonb)
returns public.os_orders language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=public.hub_os_assert_orders_access(); v_role text; v_order public.os_orders; v_updated public.os_orders; v_board text; v_from text; v_to text; v_count int; v_has_operations boolean; v_payload jsonb;
begin
 select role into v_role from public.profiles where id=v_uid; select * into v_order from public.os_orders where id=p_os_id for update;
 if v_order.id is null then raise exception 'OS não encontrada.' using errcode='P0002'; end if;
 if coalesce(v_order.archived,false) or v_order.prod_status='Finalizados' then raise exception 'OS finalizada/arquivada não pode mudar de etapa.' using errcode='22023'; end if;
 if p_next_art_status is not null and p_next_prod_status is null then v_board:='art'; elsif p_next_art_status='Produzir' and p_next_prod_status='Produção' then v_board:='art'; elsif p_next_art_status is null and p_next_prod_status is not null then v_board:='production'; else raise exception 'Combinação de status inválida.' using errcode='22023'; end if;
 if v_board='art' then
  if v_role is null or v_role not in ('admin','gerente','arte_finalista') then raise exception 'Usuário não autorizado para mover este setor.' using errcode='42501'; end if;
  if not public.hub_os_can_transition_art(v_order.art_status,p_next_art_status) then raise exception 'Transição de Arte inválida.' using errcode='22023'; end if;
  v_from:=v_order.art_status;v_to:=p_next_art_status; update public.os_orders set art_status=p_next_art_status,prod_status=case when p_next_art_status='Produzir' then 'Produção' else prod_status end,updated_at=now(),updated_by=v_uid where id=p_os_id returning * into v_updated;
 else
  if v_role is null or v_role not in ('admin','gerente','producao') then raise exception 'Usuário não autorizado para mover este setor.' using errcode='42501'; end if;
  if not public.hub_os_can_transition_production(v_order.prod_status,p_next_prod_status) then raise exception 'Transição de Produção inválida.' using errcode='22023'; end if;
  select exists(select 1 from public.os_order_item_operations op join public.os_order_items i on i.id=op.item_id where i.order_id=p_os_id and i.deleted_at is null and op.deleted_at is null) into v_has_operations;
  if v_has_operations and p_next_prod_status='Em Acabamento' then select count(*) into v_count from public.os_order_item_operations op join public.os_order_items i on i.id=op.item_id where i.order_id=p_os_id and i.deleted_at is null and i.status<>'CANCELLED' and op.deleted_at is null and op.is_required and op.work_center<>'FINISHING_QC' and op.status<>'COMPLETED'; if v_count>0 then raise exception 'Finalize as operações de produção antes de enviar para Acabamento.' using errcode='22023'; end if; end if;
  if v_has_operations and p_next_prod_status='Pronto / Avisar Cliente' then select count(*) into v_count from public.os_order_item_operations op join public.os_order_items i on i.id=op.item_id where i.order_id=p_os_id and i.deleted_at is null and i.status<>'CANCELLED' and op.deleted_at is null and op.is_required and op.status<>'COMPLETED'; if v_count>0 then raise exception 'Esta OS ainda possui % operações obrigatórias pendentes.',v_count using errcode='22023'; end if; end if;
  v_from:=v_order.prod_status;v_to:=p_next_prod_status; update public.os_orders set prod_status=p_next_prod_status,updated_at=now(),updated_by=v_uid where id=p_os_id returning * into v_updated;
 end if;
 v_payload:=(coalesce(p_event_payload,'{}'::jsonb)-array['board','from','to','actor'])||jsonb_build_object('board',v_board,'from',v_from,'to',v_to,'actor',v_uid);
 insert into public.os_orders_event(os_id,type,payload,created_by,created_at) values(p_os_id,'status_change',v_payload,v_uid,now()); return v_updated;
end $$;

revoke execute on function public.hub_os_assert_operation_access(boolean) from public,anon,authenticated;
revoke execute on function public.hub_os_recompute_item_production_status(uuid) from public,anon,authenticated;
revoke execute on function public.hub_os_create_item_operation_secure(uuid,text,uuid,boolean,text,integer) from public,anon;
revoke execute on function public.hub_os_set_item_operation_status_secure(uuid,text,text,text) from public,anon;
revoke execute on function public.hub_os_update_item_operation_secure(uuid,text,uuid,boolean,text,integer) from public,anon;
revoke execute on function public.hub_os_delete_item_operation_secure(uuid) from public,anon;
revoke execute on function public.hub_os_move_order_secure(uuid,text,text,jsonb) from public,anon;
grant execute on function public.hub_os_create_item_operation_secure(uuid,text,uuid,boolean,text,integer) to authenticated;
grant execute on function public.hub_os_set_item_operation_status_secure(uuid,text,text,text) to authenticated;
grant execute on function public.hub_os_update_item_operation_secure(uuid,text,uuid,boolean,text,integer) to authenticated;
grant execute on function public.hub_os_delete_item_operation_secure(uuid) to authenticated;
grant execute on function public.hub_os_move_order_secure(uuid,text,text,jsonb) to authenticated;
