-- Evolução OS 2.0 — Fase 4.6a
-- Order governance / safe permanent deletion.

create table public.os_order_deletion_audit (
  id uuid primary key default gen_random_uuid(), original_os_id uuid not null,
  os_number bigint, sale_number text, client_name text, title text, reason text not null,
  deleted_by uuid references auth.users(id) on delete set null, deleted_at timestamptz not null default now(),
  snapshot jsonb not null default '{}'::jsonb, dependency_counts jsonb not null default '{}'::jsonb,
  r2_keys text[] not null default '{}',
  r2_cleanup_status text not null check (r2_cleanup_status in ('PENDING','COMPLETED','PARTIAL','NOT_REQUIRED')),
  r2_cleanup_attempts integer not null default 0, r2_last_deleted_count integer not null default 0,
  r2_cleanup_errors jsonb not null default '[]'::jsonb,
  r2_cleanup_completed_at timestamptz, r2_cleanup_last_attempt_at timestamptz
);
create index os_order_deletion_audit_original_idx on public.os_order_deletion_audit(original_os_id);
create index os_order_deletion_audit_deleted_idx on public.os_order_deletion_audit(deleted_at desc);
create index os_order_deletion_audit_cleanup_idx on public.os_order_deletion_audit(r2_cleanup_status);
alter table public.os_order_deletion_audit enable row level security;
create policy os_order_deletion_audit_manager_select on public.os_order_deletion_audit for select to authenticated
  using (public.is_manager(auth.uid()));

create or replace function public.hub_os_order_delete_counts(p_os_id uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'items',(select count(*) from os_order_items where order_id=p_os_id),
  'item_operations',(select count(*) from os_order_item_operations x join os_order_items i on i.id=x.item_id where i.order_id=p_os_id),
  'assets',(select count(*) from os_order_assets where os_id=p_os_id), 'asset_jobs',(select count(*) from os_order_asset_jobs where os_id=p_os_id),
  'finance_installments',(select count(*) from os_finance_installments where os_id=p_os_id),
  'installations',(select count(*) from os_installations where os_id=p_os_id),
  'installation_checklist',(select count(*) from os_installation_checklist_items c join os_installations i on i.id=c.installation_id where i.os_id=p_os_id),
  'installation_evidence',(select count(*) from os_installation_evidence e join os_installations i on i.id=e.installation_id where i.os_id=p_os_id),
  'deliveries',(select count(*) from os_deliveries where os_id=p_os_id), 'order_events',(select count(*) from os_orders_event where os_id=p_os_id),
  'legacy_os_events',(select count(*) from os_event where os_id=p_os_id), 'payment_proofs',(select count(*) from os_payment_proof where os_id=p_os_id),
  'flow_state',(select count(*) from hub_os_order_flow_state where source_type='os_orders' and source_id=p_os_id),
  'kiosk_rows',(select count(*) from os_kiosk_board where source_type='os_orders' and source_id=p_os_id),
  'installation_feedbacks',(select count(*) from os_installation_feedbacks where source_type='os_orders' and source_id=p_os_id),
  'assignees',(select count(*) from os_order_assignees where order_id=p_os_id), 'comments',(select count(*) from os_order_comments where order_id=p_os_id),
  'deadlines',(select count(*) from os_order_deadlines where order_id=p_os_id));
$$;
revoke execute on function public.hub_os_order_delete_counts(uuid) from public,anon,authenticated;

create or replace function public.hub_os_delete_order_preview_secure(p_os_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare u uuid:=public.hub_os_assert_orders_access(); r text; o public.os_orders; blockers jsonb:='[]'; counts jsonb; expected text; r2_count int;
begin
 select role into r from profiles where id=u; if r not in ('admin','gerente') then raise exception 'Somente gerente/admin pode excluir uma OS.' using errcode='42501'; end if;
 select * into o from os_orders where id=p_os_id; if not found then raise exception 'OS não encontrada.' using errcode='P0002'; end if;
 if exists(select 1 from os_finance_installments where os_id=p_os_id and status in ('CONCILIADO','LANCADO')) then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','FINANCE_SETTLED','message','Esta OS possui histórico financeiro sujeito à retenção e não pode ser excluída definitivamente.')); end if;
 if exists(select 1 from os_order_assets where os_id=p_os_id and asset_type='PAYMENT_PROOF') or exists(select 1 from os_payment_proof where os_id=p_os_id) then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','PAYMENT_PROOF_RETENTION','message','Esta OS possui comprovante financeiro sujeito à retenção e não pode ser excluída definitivamente.')); end if;
 counts:=public.hub_os_order_delete_counts(p_os_id); expected:=coalesce(o.os_number::text,o.sale_number);
 select count(distinct object_path) into r2_count from os_order_assets where os_id=p_os_id and object_path is not null and deleted_from_storage_at is null and asset_type<>'PAYMENT_PROOF' and (storage_provider='r2' or storage_bucket is not null or bucket is not null);
 return jsonb_build_object('order',jsonb_build_object('id',o.id,'display_number',expected,'sale_number',o.sale_number,'os_number',o.os_number,'client_name',o.client_name,'prod_status',o.prod_status,'art_status',o.art_status,'archived',o.archived),'allowed',jsonb_array_length(blockers)=0,'blockers',blockers,'counts',counts,'r2_object_count',r2_count,'expected_confirmation',expected);
end $$;

create or replace function public.hub_os_delete_order_secure_v2(p_os_id uuid,p_reason text,p_confirmation text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare u uuid:=public.hub_os_assert_orders_access(); r text; o public.os_orders; expected text; counts jsonb; keys text[]; aid uuid;
begin
 select role into r from profiles where id=u; if r not in ('admin','gerente') then raise exception 'Somente gerente/admin pode excluir uma OS.' using errcode='42501'; end if;
 select * into o from os_orders where id=p_os_id for update; if not found then raise exception 'OS não encontrada.' using errcode='P0002'; end if;
 if length(trim(coalesce(p_reason,'')))<5 or lower(trim(p_reason))='delete' then raise exception 'Informe o motivo da exclusão.' using errcode='22023'; end if;
 expected:=coalesce(o.os_number::text,o.sale_number); if lower(trim(coalesce(p_confirmation,'')))<>lower(expected) then raise exception 'Confirmação da OS inválida.' using errcode='22023'; end if;
 if exists(select 1 from os_finance_installments where os_id=p_os_id and status in ('CONCILIADO','LANCADO')) or exists(select 1 from os_order_assets where os_id=p_os_id and asset_type='PAYMENT_PROOF') or exists(select 1 from os_payment_proof where os_id=p_os_id) then raise exception 'Esta OS possui histórico/comprovante financeiro sujeito à retenção e não pode ser excluída definitivamente. Arquive a OS para preservar o histórico.' using errcode='23514'; end if;
 counts:=public.hub_os_order_delete_counts(p_os_id);
 select coalesce(array_agg(distinct object_path),'{}') into keys from os_order_assets where os_id=p_os_id and object_path is not null and deleted_from_storage_at is null and asset_type<>'PAYMENT_PROOF' and (storage_provider='r2' or storage_bucket is not null or bucket is not null);
 insert into os_order_deletion_audit(original_os_id,os_number,sale_number,client_name,title,reason,deleted_by,snapshot,dependency_counts,r2_keys,r2_cleanup_status)
 values(o.id,o.os_number,o.sale_number,o.client_name,o.title,trim(p_reason),u,jsonb_build_object('id',o.id,'os_number',o.os_number,'sale_number',o.sale_number,'client_name',o.client_name,'title',o.title,'art_status',o.art_status,'prod_status',o.prod_status,'logistic_type',o.logistic_type,'archived',o.archived,'created_at',o.created_at,'updated_at',o.updated_at),counts,keys,case when cardinality(keys)=0 then 'NOT_REQUIRED' else 'PENDING' end) returning id into aid;
 delete from os_installation_evidence where installation_id in(select id from os_installations where os_id=p_os_id);
 delete from os_installation_checklist_items where installation_id in(select id from os_installations where os_id=p_os_id);
 delete from os_installations where os_id=p_os_id; delete from os_deliveries where os_id=p_os_id;
 delete from os_installation_feedbacks where source_type='os_orders' and source_id=p_os_id; delete from hub_os_order_flow_state where source_type='os_orders' and source_id=p_os_id; delete from os_kiosk_board where source_type='os_orders' and source_id=p_os_id;
 delete from os_event where os_id=p_os_id; delete from os_orders_event where os_id=p_os_id; delete from os_payment_proof where os_id=p_os_id;
 delete from os_orders where id=p_os_id;
 return jsonb_build_object('audit_id',aid,'os_id',o.id,'display_number',expected,'sale_number',o.sale_number,'client_name',o.client_name,'counts',counts,'r2_keys',to_jsonb(keys),'r2_cleanup_status',case when cardinality(keys)=0 then 'NOT_REQUIRED' else 'PENDING' end);
end $$;

drop function public.hub_os_delete_order_secure(uuid,text,jsonb);
create or replace function public.hub_os_delete_order_secure(p_os_id uuid,p_reason text default 'delete'::text,p_payload jsonb default '{}') returns void
language plpgsql security definer set search_path=public as $$ begin perform public.hub_os_delete_order_secure_v2(p_os_id,p_reason,p_payload->>'confirmation',p_payload); end $$;

create or replace function public.hub_os_mark_order_delete_cleanup_secure(p_audit_id uuid,p_deleted_count integer,p_errors jsonb) returns public.os_order_deletion_audit
language plpgsql security definer set search_path=public as $$
declare u uuid:=public.hub_os_assert_orders_access(); r text; a public.os_order_deletion_audit;
begin select role into r from profiles where id=u; if r not in ('admin','gerente') then raise exception 'Somente gerente/admin.' using errcode='42501'; end if;
 update os_order_deletion_audit set r2_cleanup_status=case when jsonb_array_length(coalesce(p_errors,'[]'))=0 then 'COMPLETED' else 'PARTIAL' end,r2_cleanup_attempts=r2_cleanup_attempts+1,r2_last_deleted_count=greatest(coalesce(p_deleted_count,0),0),r2_cleanup_errors=coalesce(p_errors,'[]'),r2_cleanup_last_attempt_at=now(),r2_cleanup_completed_at=case when jsonb_array_length(coalesce(p_errors,'[]'))=0 then now() else null end where id=p_audit_id returning * into a;
 if not found then raise exception 'Auditoria não encontrada.' using errcode='P0002'; end if; return a; end $$;

revoke execute on function public.hub_os_delete_order_preview_secure(uuid) from public,anon;
revoke execute on function public.hub_os_delete_order_secure_v2(uuid,text,text,jsonb) from public,anon;
revoke execute on function public.hub_os_delete_order_secure(uuid,text,jsonb) from public,anon;
revoke execute on function public.hub_os_mark_order_delete_cleanup_secure(uuid,integer,jsonb) from public,anon;
grant execute on function public.hub_os_delete_order_preview_secure(uuid) to authenticated;
grant execute on function public.hub_os_delete_order_secure_v2(uuid,text,text,jsonb) to authenticated;
grant execute on function public.hub_os_delete_order_secure(uuid,text,jsonb) to authenticated;
grant execute on function public.hub_os_mark_order_delete_cleanup_secure(uuid,integer,jsonb) to authenticated;
