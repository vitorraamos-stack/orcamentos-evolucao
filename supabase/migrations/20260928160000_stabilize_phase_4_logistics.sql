-- Phase 4.0.1: non-destructive logistics stabilization.
create or replace function public.hub_os_validate_installation_assignment()
returns trigger language plpgsql security definer set search_path=public as $$
declare responsible_role text;
begin
  if new.team_id is not null and not exists (select 1 from public.os_installation_teams where id=new.team_id and active) then
    raise exception 'Equipe inválida ou inativa.';
  end if;
  if new.responsible_id is not null then
    select case when role='admin' then 'gerente' else role end into responsible_role from public.profiles where id=new.responsible_id;
    if responsible_role is null then raise exception 'Responsável inexistente.'; end if;
    if responsible_role not in ('instalador','gerente') then raise exception 'Responsável deve ser instalador ou gerente.'; end if;
    if new.team_id is not null and responsible_role <> 'gerente' and not exists (
      select 1 from public.os_installation_team_members where team_id=new.team_id and user_id=new.responsible_id
    ) then raise exception 'Responsável não pertence à equipe.'; end if;
  end if;
  return new;
end $$;
revoke execute on function public.hub_os_validate_installation_assignment() from public, anon, authenticated;
drop trigger if exists os_installations_validate_assignment on public.os_installations;
create trigger os_installations_validate_assignment before insert or update of team_id,responsible_id on public.os_installations for each row execute function public.hub_os_validate_installation_assignment();

create or replace function public.hub_os_assert_installation_executor(p_installation public.os_installations, p_complete boolean)
returns void language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); r text;
begin
  if u is null or not exists(select 1 from public.user_module_access where user_id=u and module_key='hub_os') then raise exception 'Acesso ao Hub OS obrigatório.' using errcode='42501'; end if;
  select public.hub_os_logistics_role() into r;
  if r not in ('instalador','gerente') then raise exception 'Perfil não autorizado a executar instalações.' using errcode='42501'; end if;
  if r='instalador' and (p_installation.responsible_id is distinct from u and not exists(select 1 from public.os_installation_team_members where team_id=p_installation.team_id and user_id=u)) then raise exception 'Instalação não atribuída a este usuário.' using errcode='42501'; end if;
  if p_complete and r='instalador' and p_installation.status <> 'IN_PROGRESS' then raise exception 'Instalador somente conclui instalação em execução.' using errcode='42501'; end if;
end $$;
revoke execute on function public.hub_os_assert_installation_executor(public.os_installations,boolean) from public,anon,authenticated;

create or replace function public.hub_os_start_installation_secure(p_installation_id uuid) returns public.os_installations language plpgsql security definer set search_path=public as $$declare u uuid:=auth.uid();v public.os_installations;begin select * into v from public.os_installations where id=p_installation_id for update;if v.id is null then raise exception 'Instalação não encontrada.';end if;perform public.hub_os_assert_installation_executor(v,false);if v.status<>'SCHEDULED' then raise exception 'Instalação não está agendada.';end if;perform 1 from public.os_orders where id=v.os_id for update;update public.os_installations set status='IN_PROGRESS',started_at=now(),updated_by=u,updated_at=now() where id=v.id returning * into v;insert into public.os_orders_event(os_id,type,payload,created_by) values(v.os_id,'INSTALLATION_STARTED',jsonb_build_object('installation_id',v.id),u);return v;end$$;
create or replace function public.hub_os_complete_installation_secure(p_installation_id uuid) returns public.os_installations language plpgsql security definer set search_path=public as $$declare u uuid:=auth.uid();v public.os_installations;begin select * into v from public.os_installations where id=p_installation_id for update;if v.id is null then raise exception 'Instalação não encontrada.';end if;perform public.hub_os_assert_installation_executor(v,true);if v.status not in ('SCHEDULED','IN_PROGRESS') then raise exception 'Instalação não pode ser concluída.';end if;perform 1 from public.os_orders where id=v.os_id for update;update public.os_installations set status='COMPLETED',started_at=coalesce(started_at,now()),completed_at=now(),updated_by=u,updated_at=now() where id=v.id returning * into v;update public.os_orders set prod_status='Finalizados',updated_at=now() where id=v.os_id;insert into public.os_orders_event(os_id,type,payload,created_by) values(v.os_id,'INSTALLATION_COMPLETED',jsonb_build_object('installation_id',v.id),u);return v;end$$;

create or replace function public.hub_os_update_delivery_secure(p_delivery_id uuid,p_scheduled_at timestamptz default null,p_assigned_to uuid default null,p_vehicle_label text default null,p_carrier_name text default null,p_tracking_code text default null,p_notes text default null) returns public.os_deliveries language plpgsql security definer set search_path=public as $$
declare u uuid:=public.hub_os_assert_logistics_actor('DELIVERY'); v public.os_deliveries;
begin
 select * into v from public.os_deliveries where id=p_delivery_id for update;
 if v.id is null then raise exception 'Entrega não encontrada.'; end if;
 if v.status <> 'SCHEDULED' and not (v.mode='CARRIER' and v.status='IN_TRANSIT') then raise exception 'Entrega não permite edição.'; end if;
 if p_assigned_to is not null and not exists(select 1 from public.profiles where id=p_assigned_to and (case when role='admin' then 'gerente' else role end) in ('instalador','producao','gerente')) then raise exception 'Responsável inválido.'; end if;
 update public.os_deliveries set
  scheduled_at=case when v.status='SCHEDULED' then p_scheduled_at else scheduled_at end,
  assigned_to=case when v.status='SCHEDULED' and v.mode='OWN_DELIVERY' then p_assigned_to else assigned_to end,
  vehicle_label=case when v.status='SCHEDULED' and v.mode='OWN_DELIVERY' then nullif(trim(p_vehicle_label),'') else vehicle_label end,
  carrier_name=case when v.mode='CARRIER' then nullif(trim(p_carrier_name),'') else carrier_name end,
  tracking_code=case when v.mode='CARRIER' then nullif(trim(p_tracking_code),'') else tracking_code end,
  notes=nullif(trim(p_notes),''),updated_by=u,updated_at=now()
 where id=v.id returning * into v;
 insert into public.os_orders_event(os_id,type,payload,created_by) values(v.os_id,'DELIVERY_DETAILS_UPDATED',jsonb_build_object('delivery_id',v.id),u);
 return v;
end $$;
revoke execute on function public.hub_os_update_delivery_secure(uuid,timestamptz,uuid,text,text,text,text) from public,anon;
grant execute on function public.hub_os_update_delivery_secure(uuid,timestamptz,uuid,text,text,text,text) to authenticated;
revoke execute on function public.hub_os_start_installation_secure(uuid),public.hub_os_complete_installation_secure(uuid) from public,anon;
grant execute on function public.hub_os_start_installation_secure(uuid),public.hub_os_complete_installation_secure(uuid) to authenticated;
