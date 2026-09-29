-- Evolucao OS 2.0 - Phase 4.1: secure field execution.
alter table public.os_installations add column if not exists completion_notes text;

create table if not exists public.os_installation_checklist_items (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.os_installations(id) on delete cascade,
  phase text not null check (phase in ('PRE_START','COMPLETION')),
  code text not null,
  label text not null,
  status text not null default 'PENDING' check (status in ('PENDING','DONE','NOT_APPLICABLE')),
  is_required boolean not null default true,
  allow_not_applicable boolean not null default false,
  note text,
  completed_by uuid references public.profiles(id),
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (installation_id, phase, code)
);

create table if not exists public.os_installation_evidence (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.os_installations(id) on delete cascade,
  asset_id uuid not null unique references public.os_order_assets(id),
  phase text not null check (phase in ('BEFORE','DURING','AFTER')),
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists os_installation_evidence_installation_phase_created_idx
  on public.os_installation_evidence(installation_id, phase, created_at);

alter table public.os_order_assets drop constraint if exists os_order_assets_asset_type_check;
alter table public.os_order_assets add constraint os_order_assets_asset_type_check
  check (asset_type in ('CLIENT_FILE','PAYMENT_PROOF','PURCHASE_ORDER','LAYOUT','INSTALLATION_EVIDENCE'));

create or replace function public.hub_os_seed_installation_checklist(p_installation_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.os_installation_checklist_items(installation_id,phase,code,label,is_required,allow_not_applicable,sort_order)
  values
    (p_installation_id,'PRE_START','MATERIALS','Materiais da instalação conferidos',true,false,10),
    (p_installation_id,'PRE_START','TOOLS','Ferramentas e equipamentos conferidos',true,false,20),
    (p_installation_id,'PRE_START','PPE','EPIs necessários conferidos',true,false,30),
    (p_installation_id,'PRE_START','SITE','Endereço, acesso e condições do local conferidos',true,false,40),
    (p_installation_id,'COMPLETION','SERVICE','Instalação finalizada e conferida',true,false,10),
    (p_installation_id,'COMPLETION','FIXING','Fixação e acabamento conferidos',true,false,20),
    (p_installation_id,'COMPLETION','FUNCTIONAL_TEST','Teste funcional / iluminação realizado',true,true,30),
    (p_installation_id,'COMPLETION','CLEANUP','Local limpo e organizado',true,false,40)
  on conflict (installation_id,phase,code) do nothing;
end $$;
revoke execute on function public.hub_os_seed_installation_checklist(uuid) from public,anon,authenticated;

create or replace function public.hub_os_seed_installation_checklist_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.hub_os_seed_installation_checklist(new.id); return new; end $$;
revoke execute on function public.hub_os_seed_installation_checklist_trigger() from public,anon,authenticated;
drop trigger if exists os_installations_seed_checklist on public.os_installations;
create trigger os_installations_seed_checklist after insert on public.os_installations
for each row execute function public.hub_os_seed_installation_checklist_trigger();
do $$ declare v_id uuid; begin
  for v_id in select id from public.os_installations where status in ('SCHEDULED','IN_PROGRESS')
  loop perform public.hub_os_seed_installation_checklist(v_id); end loop;
end $$;

alter table public.os_installation_checklist_items enable row level security;
alter table public.os_installation_evidence enable row level security;
create policy os_installation_checklist_select_hub on public.os_installation_checklist_items for select to authenticated
  using (exists(select 1 from public.user_module_access where user_id=auth.uid() and module_key='hub_os'));
create policy os_installation_evidence_select_hub on public.os_installation_evidence for select to authenticated
  using (exists(select 1 from public.user_module_access where user_id=auth.uid() and module_key='hub_os'));
grant select on public.os_installation_checklist_items,public.os_installation_evidence to authenticated;
revoke insert,update,delete on public.os_installation_checklist_items,public.os_installation_evidence from anon,authenticated;

create or replace function public.hub_os_get_installation_evidence_scope_secure(p_installation_id uuid,p_phase text)
returns table(installation_id uuid,os_id uuid,status text) language plpgsql security definer set search_path=public as $$
declare v public.os_installations;
begin
  select * into v from public.os_installations where id=p_installation_id;
  if v.id is null then raise exception 'Instalação não encontrada.'; end if;
  perform public.hub_os_assert_installation_executor(v,false);
  if p_phase not in ('BEFORE','DURING','AFTER') then raise exception 'Fase de evidência inválida.'; end if;
  if (p_phase='BEFORE' and v.status not in ('SCHEDULED','IN_PROGRESS')) or
     (p_phase in ('DURING','AFTER') and v.status<>'IN_PROGRESS') then
    raise exception 'A instalação não aceita evidências nesta fase/status.';
  end if;
  return query select v.id,v.os_id,v.status;
end $$;

create or replace function public.hub_os_set_installation_checklist_item_secure(p_item_id uuid,p_status text,p_note text default null)
returns public.os_installation_checklist_items language plpgsql security definer set search_path=public as $$
declare v_item public.os_installation_checklist_items; v_installation public.os_installations; u uuid:=auth.uid();
begin
  select * into v_item from public.os_installation_checklist_items where id=p_item_id for update;
  if v_item.id is null then raise exception 'Item de checklist não encontrado.'; end if;
  select * into v_installation from public.os_installations where id=v_item.installation_id for update;
  perform public.hub_os_assert_installation_executor(v_installation,false);
  if p_status not in ('PENDING','DONE','NOT_APPLICABLE') then raise exception 'Status de checklist inválido.'; end if;
  if p_status='NOT_APPLICABLE' and not v_item.allow_not_applicable then raise exception 'Este item não aceita Não se aplica.'; end if;
  if (v_item.phase='PRE_START' and v_installation.status<>'SCHEDULED') or
     (v_item.phase='COMPLETION' and v_installation.status<>'IN_PROGRESS') then raise exception 'Checklist somente leitura neste status.'; end if;
  update public.os_installation_checklist_items set status=p_status,note=nullif(trim(p_note),''),
    completed_by=case when p_status='PENDING' then null else u end,
    completed_at=case when p_status='PENDING' then null else now() end,updated_at=now()
  where id=p_item_id returning * into v_item;
  return v_item;
end $$;

create or replace function public.hub_os_register_installation_evidence_secure(
 p_installation_id uuid,p_phase text,p_object_path text,p_original_name text,p_mime_type text,p_size_bytes bigint,
 p_storage_bucket text,p_r2_etag text default null,p_note text default null)
returns public.os_installation_evidence language plpgsql security definer set search_path=public as $$
declare v public.os_installations; a public.os_order_assets; e public.os_installation_evidence; u uuid:=auth.uid(); expected text; total_count int; phase_count int;
begin
  select * into v from public.os_installations where id=p_installation_id for update;
  if v.id is null then raise exception 'Instalação não encontrada.'; end if;
  perform public.hub_os_assert_installation_executor(v,false);
  if p_phase not in ('BEFORE','DURING','AFTER') then raise exception 'Fase de evidência inválida.'; end if;
  if (p_phase='BEFORE' and v.status not in ('SCHEDULED','IN_PROGRESS')) or (p_phase in ('DURING','AFTER') and v.status<>'IN_PROGRESS') then raise exception 'A instalação não aceita evidências nesta fase/status.'; end if;
  if lower(p_mime_type) not in ('image/jpeg','image/jpg','image/png','image/webp') then raise exception 'Formato de foto não suportado.'; end if;
  if p_size_bytes is null or p_size_bytes<=0 or p_size_bytes>20*1024*1024 then raise exception 'Foto fora do limite de 20 MB.'; end if;
  expected:='os_orders/'||v.os_id||'/Instalacoes/'||v.id||'/'||lower(p_phase)||'/';
  if p_object_path not like expected||'%' or p_object_path like '%..%' then raise exception 'Caminho da evidência inválido.'; end if;
  select count(*),count(*) filter(where phase=p_phase) into total_count,phase_count from public.os_installation_evidence where installation_id=v.id;
  if total_count>=30 or phase_count>=12 then raise exception 'Limite de evidências atingido.'; end if;
  insert into public.os_order_assets(os_id,job_id,asset_type,storage_provider,object_path,original_name,mime_type,size_bytes,uploaded_by,storage_bucket,bucket,r2_etag)
  values(v.os_id,null,'INSTALLATION_EVIDENCE','r2',p_object_path,p_original_name,lower(p_mime_type),p_size_bytes,u,p_storage_bucket,p_storage_bucket,p_r2_etag) returning * into a;
  insert into public.os_installation_evidence(installation_id,asset_id,phase,note,created_by)
  values(v.id,a.id,p_phase,nullif(trim(p_note),''),u) returning * into e;
  return e;
end $$;

create or replace function public.hub_os_update_installation_completion_notes_secure(p_installation_id uuid,p_notes text)
returns public.os_installations language plpgsql security definer set search_path=public as $$
declare v public.os_installations; u uuid:=auth.uid(); begin
 select * into v from public.os_installations where id=p_installation_id for update;
 if v.id is null then raise exception 'Instalação não encontrada.'; end if;
 perform public.hub_os_assert_installation_executor(v,false);
 if v.status<>'IN_PROGRESS' then raise exception 'Observações finais só podem ser alteradas durante a execução.'; end if;
 if length(coalesce(p_notes,''))>4000 then raise exception 'Observações finais devem ter no máximo 4000 caracteres.'; end if;
 update public.os_installations set completion_notes=nullif(trim(p_notes),''),updated_by=u,updated_at=now() where id=v.id returning * into v; return v;
end $$;

create or replace function public.hub_os_start_installation_secure(p_installation_id uuid)
returns public.os_installations language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();v public.os_installations; begin
 select * into v from public.os_installations where id=p_installation_id for update;
 if v.id is null then raise exception 'Instalação não encontrada.'; end if;
 perform public.hub_os_assert_installation_executor(v,false);
 if v.status<>'SCHEDULED' then raise exception 'Instalação não está agendada.'; end if;
 if not exists(select 1 from public.os_installation_checklist_items where installation_id=v.id and phase='PRE_START') or exists(
   select 1 from public.os_installation_checklist_items where installation_id=v.id and phase='PRE_START' and is_required and not(status='DONE' or (status='NOT_APPLICABLE' and allow_not_applicable)))
 then raise exception 'Conclua o checklist pré-instalação antes de iniciar o serviço.'; end if;
 perform 1 from public.os_orders where id=v.os_id for update;
 update public.os_installations set status='IN_PROGRESS',started_at=now(),updated_by=u,updated_at=now() where id=v.id returning * into v;
 insert into public.os_orders_event(os_id,type,payload,created_by) values(v.os_id,'INSTALLATION_STARTED',jsonb_build_object('installation_id',v.id),u); return v;
end $$;

create or replace function public.hub_os_complete_installation_secure(p_installation_id uuid)
returns public.os_installations language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();v public.os_installations; begin
 select * into v from public.os_installations where id=p_installation_id for update;
 if v.id is null then raise exception 'Instalação não encontrada.'; end if;
 perform public.hub_os_assert_installation_executor(v,true);
 if v.status<>'IN_PROGRESS' then raise exception 'Instalação deve estar em execução para ser concluída.'; end if;
 if not exists(select 1 from public.os_installation_checklist_items where installation_id=v.id and phase='COMPLETION') or exists(
   select 1 from public.os_installation_checklist_items where installation_id=v.id and phase='COMPLETION' and is_required and not(status='DONE' or (status='NOT_APPLICABLE' and allow_not_applicable)))
 then raise exception 'Conclua o checklist final antes de finalizar a instalação.'; end if;
 if not exists(select 1 from public.os_installation_evidence e join public.os_order_assets a on a.id=e.asset_id and a.deleted_from_storage_at is null where e.installation_id=v.id and e.phase='AFTER') then raise exception 'Adicione pelo menos uma foto de ''Depois'' antes de concluir.'; end if;
 perform 1 from public.os_orders where id=v.os_id for update;
 update public.os_installations set status='COMPLETED',completed_at=now(),updated_by=u,updated_at=now() where id=v.id returning * into v;
 update public.os_orders set prod_status='Finalizados',updated_at=now() where id=v.os_id;
 insert into public.os_orders_event(os_id,type,payload,created_by) values(v.os_id,'INSTALLATION_COMPLETED',jsonb_build_object('installation_id',v.id),u); return v;
end $$;

create or replace function public.hub_os_force_complete_installation_secure(p_installation_id uuid,p_reason text)
returns public.os_installations language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();v public.os_installations;r text;pre_missing boolean;completion_missing boolean;after_missing boolean;previous text; begin
 if length(trim(coalesce(p_reason,'')))=0 then raise exception 'Motivo da conclusão excepcional é obrigatório.'; end if;
 if u is null or not exists(select 1 from public.user_module_access where user_id=u and module_key='hub_os') then raise exception 'Acesso ao Hub OS obrigatório.' using errcode='42501'; end if;
 select public.hub_os_logistics_role() into r; if r<>'gerente' then raise exception 'Somente gerente pode concluir excepcionalmente.' using errcode='42501'; end if;
 select * into v from public.os_installations where id=p_installation_id for update;
 if v.id is null then raise exception 'Instalação não encontrada.'; end if; if v.status not in ('SCHEDULED','IN_PROGRESS') then raise exception 'Instalação não está ativa.'; end if;
 previous:=v.status;
 pre_missing:=not exists(select 1 from public.os_installation_checklist_items where installation_id=v.id and phase='PRE_START') or exists(select 1 from public.os_installation_checklist_items where installation_id=v.id and phase='PRE_START' and is_required and not(status='DONE' or(status='NOT_APPLICABLE' and allow_not_applicable)));
 completion_missing:=not exists(select 1 from public.os_installation_checklist_items where installation_id=v.id and phase='COMPLETION') or exists(select 1 from public.os_installation_checklist_items where installation_id=v.id and phase='COMPLETION' and is_required and not(status='DONE' or(status='NOT_APPLICABLE' and allow_not_applicable)));
 after_missing:=not exists(select 1 from public.os_installation_evidence e join public.os_order_assets a on a.id=e.asset_id and a.deleted_from_storage_at is null where e.installation_id=v.id and e.phase='AFTER');
 perform 1 from public.os_orders where id=v.os_id for update;
 update public.os_installations set status='COMPLETED',started_at=coalesce(started_at,now()),completed_at=now(),updated_by=u,updated_at=now() where id=v.id returning * into v;
 update public.os_orders set prod_status='Finalizados',updated_at=now() where id=v.os_id;
 insert into public.os_orders_event(os_id,type,payload,created_by) values(v.os_id,'INSTALLATION_COMPLETED_OVERRIDE',jsonb_build_object('installation_id',v.id,'reason',trim(p_reason),'previous_status',previous,'missing_pre_checklist',pre_missing,'missing_completion_checklist',completion_missing,'missing_after_evidence',after_missing),u); return v;
end $$;

do $$ declare s regprocedure; begin
 foreach s in array array[
  'public.hub_os_get_installation_evidence_scope_secure(uuid,text)'::regprocedure,
  'public.hub_os_set_installation_checklist_item_secure(uuid,text,text)'::regprocedure,
  'public.hub_os_register_installation_evidence_secure(uuid,text,text,text,text,bigint,text,text,text)'::regprocedure,
  'public.hub_os_update_installation_completion_notes_secure(uuid,text)'::regprocedure,
  'public.hub_os_force_complete_installation_secure(uuid,text)'::regprocedure
 ] loop execute format('revoke execute on function %s from public, anon',s); execute format('grant execute on function %s to authenticated',s); end loop;
end $$;
revoke execute on function public.hub_os_start_installation_secure(uuid),public.hub_os_complete_installation_secure(uuid) from public,anon;
grant execute on function public.hub_os_start_installation_secure(uuid),public.hub_os_complete_installation_secure(uuid) to authenticated;

do $$ begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='os_installation_checklist_items') then alter publication supabase_realtime add table public.os_installation_checklist_items; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='os_installation_evidence') then alter publication supabase_realtime add table public.os_installation_evidence; end if;
end if; end $$;
