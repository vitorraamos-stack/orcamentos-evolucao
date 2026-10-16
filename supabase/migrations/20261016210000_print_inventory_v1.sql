-- EvoluSystem | Impressao & Estoque V1
-- Revisao em PR: NAO executar automaticamente em producao.
create sequence if not exists public.print_inventory_roll_seq;
revoke all on sequence public.print_inventory_roll_seq from public, anon, authenticated;

insert into public.app_modules (module_key, label, route_prefixes)
values ('impressao_estoque', 'Impressão & Estoque', '["/impressao-estoque"]'::jsonb)
on conflict (module_key) do update set label = excluded.label, route_prefixes = excluded.route_prefixes;

insert into public.user_module_access(user_id,module_key)
select id,'impressao_estoque' from public.profiles where role in ('admin','gerente')
on conflict do nothing;

create table if not exists public.print_inventory_rolls (
 id uuid primary key default gen_random_uuid(),
 code text not null unique default ('B-' || lpad(nextval('public.print_inventory_roll_seq')::text,3,'0')),
 material text not null check (length(btrim(material)) between 2 and 120),
 width_cm numeric(10,2) not null check (width_cm>0),
 initial_length_m numeric(12,4) not null check (initial_length_m>0),
 remaining_length_m numeric(12,4) not null check (remaining_length_m>=0 and remaining_length_m<=initial_length_m),
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);

create table if not exists public.print_inventory_inks (
 color text primary key check (color in ('C','M','Y','K')),
 balance_ml numeric(12,2) not null default 0 check (balance_ml>=0),
 updated_at timestamptz not null default now()
);
insert into public.print_inventory_inks(color) values ('C'),('M'),('Y'),('K') on conflict do nothing;

create table if not exists public.print_inventory_events (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 request_payload jsonb not null,
 kind text not null check (kind in ('ROLL_IN','PRINT','REPRINT','ROLL_ADJUST','INK_IN','INK_USE')),
 roll_id uuid references public.print_inventory_rolls(id) on delete restrict,
 color text references public.print_inventory_inks(color),
 delta_m numeric(12,4),
 delta_ml numeric(12,2),
 os_ref text,
 order_id uuid references public.os_orders(id) on delete set null,
 width_cm numeric(10,2),
 length_cm numeric(12,2),
 copies integer,
 waste_cm numeric(12,2),
 reason text,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 constraint inventory_event_target check (
   (roll_id is not null and color is null and delta_m is not null and delta_ml is null)
   or (roll_id is null and color is not null and delta_m is null and delta_ml is not null)
 )
);
create index if not exists print_inventory_events_recent on public.print_inventory_events(created_at desc);
create index if not exists print_inventory_events_roll on public.print_inventory_events(roll_id,created_at desc);

alter table public.print_inventory_rolls enable row level security;
alter table public.print_inventory_inks enable row level security;
alter table public.print_inventory_events enable row level security;
revoke all on public.print_inventory_rolls, public.print_inventory_inks, public.print_inventory_events from public, anon, authenticated;
grant select on public.print_inventory_rolls, public.print_inventory_inks, public.print_inventory_events to authenticated;
create policy print_inventory_rolls_read on public.print_inventory_rolls for select to authenticated
 using (public.has_module_access(auth.uid(),'impressao_estoque'));
create policy print_inventory_inks_read on public.print_inventory_inks for select to authenticated
 using (public.has_module_access(auth.uid(),'impressao_estoque'));
create policy print_inventory_events_read on public.print_inventory_events for select to authenticated
 using (public.has_module_access(auth.uid(),'impressao_estoque'));

create or replace function public.print_inventory_assert_access()
returns void language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or not public.has_module_access(auth.uid(),'impressao_estoque') then
  raise exception 'Acesso não autorizado ao estoque de impressão.' using errcode='42501';
 end if;
end;
$$;
revoke all on function public.print_inventory_assert_access() from public, anon, authenticated;

create or replace function public.print_inventory_add_roll(
 p_request_id uuid,p_material text,p_width_cm numeric,p_length_m numeric
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_existing uuid; v_payload jsonb;
begin
 perform public.print_inventory_assert_access();
 if p_request_id is null or length(btrim(coalesce(p_material,''))) not between 2 and 120
    or p_width_cm is null or p_width_cm<=0 or p_width_cm>500
    or p_length_m is null or p_length_m<=0 or p_length_m>10000 then
  raise exception 'Dados inválidos para cadastrar bobina.' using errcode='22023';
 end if;
 v_payload := jsonb_build_object('kind','ROLL_IN','material',btrim(p_material),'width_cm',p_width_cm,'length_m',p_length_m);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_request_id::text));
 select id,roll_id into v_existing,v_id from public.print_inventory_events where request_id=p_request_id;
 if found then
  if not exists(select 1 from public.print_inventory_events where id=v_existing and kind='ROLL_IN'
     and request_payload=v_payload and created_by=auth.uid()) then
   raise exception 'Esta operação já foi utilizada com dados diferentes.' using errcode='23505';
  end if;
  return v_id;
 end if;
 insert into public.print_inventory_rolls(material,width_cm,initial_length_m,remaining_length_m,created_by)
 values (btrim(p_material),p_width_cm,p_length_m,p_length_m,auth.uid()) returning id into v_id;
 insert into public.print_inventory_events(request_id,request_payload,kind,roll_id,delta_m,created_by)
 values (p_request_id,v_payload,'ROLL_IN',v_id,p_length_m,auth.uid());
 return v_id;
end;
$$;

create or replace function public.print_inventory_record_print(
 p_request_id uuid,p_roll_id uuid,p_os_ref text,p_width_cm numeric,p_length_cm numeric,
 p_copies integer,p_waste_cm numeric default 0,p_reprint boolean default false,p_reason text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_roll public.print_inventory_rolls%rowtype; v_order_id uuid; v_order_count integer; v_delta numeric(12,4); v_event uuid; v_payload jsonb;
begin
 perform public.print_inventory_assert_access();
 if p_request_id is null or p_roll_id is null or length(btrim(coalesce(p_os_ref,'')))=0
    or p_width_cm is null or p_width_cm<=0 or p_length_cm is null or p_length_cm<=0
    or p_copies is null or p_copies<1 or p_copies>10000 or p_waste_cm is null or p_waste_cm<0
    or (p_reprint and length(btrim(coalesce(p_reason,'')))=0) then
  raise exception 'Dados inválidos para registrar impressão.' using errcode='22023';
 end if;
 v_payload := jsonb_build_object('kind',case when coalesce(p_reprint,false) then 'REPRINT' else 'PRINT' end,
   'roll_id',p_roll_id,'os_ref',btrim(p_os_ref),'width_cm',p_width_cm,'length_cm',p_length_cm,
   'copies',p_copies,'waste_cm',p_waste_cm,'reason',nullif(btrim(p_reason),''));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_request_id::text));
 select id into v_event from public.print_inventory_events where request_id=p_request_id;
 if found then
  if not exists(select 1 from public.print_inventory_events e where e.id=v_event
    and e.kind=case when coalesce(p_reprint,false) then 'REPRINT' else 'PRINT' end
    and e.request_payload=v_payload and e.created_by=auth.uid()) then
   raise exception 'Esta operação já foi utilizada com dados diferentes.' using errcode='23505';
  end if;
  return v_event;
 end if;
 select * into v_roll from public.print_inventory_rolls where id=p_roll_id for update;
 if not found then raise exception 'Bobina não encontrada.' using errcode='P0002'; end if;
 if p_width_cm>v_roll.width_cm then
  raise exception 'A arte excede a largura da bobina.' using errcode='22023';
 end if;
 select count(*)::integer, min(id::text)::uuid into v_order_count,v_order_id
 from public.os_orders
 where sale_number=btrim(p_os_ref)
    or (os_number is not null and os_number::text=btrim(p_os_ref));
 if v_order_count=0 then
  raise exception 'OS não encontrada. Confira o número cadastrado na Ordem de Serviço.' using errcode='P0002';
 elsif v_order_count>1 then
  raise exception 'Mais de uma OS encontrada para este número. Confira a identificação.' using errcode='22023';
 end if;
 v_delta:=round((p_length_cm*p_copies+p_waste_cm)/100,4);
 if v_delta<=0 or v_delta>v_roll.remaining_length_m then
  raise exception 'Metragem insuficiente ou inválida para esta bobina.' using errcode='22023';
 end if;
 update public.print_inventory_rolls set remaining_length_m=remaining_length_m-v_delta where id=p_roll_id;
 insert into public.print_inventory_events
 (request_id,request_payload,kind,roll_id,delta_m,os_ref,order_id,width_cm,length_cm,copies,waste_cm,reason,created_by)
 values(p_request_id,v_payload,case when coalesce(p_reprint,false) then 'REPRINT' else 'PRINT' end,p_roll_id,-v_delta,
 btrim(p_os_ref),v_order_id,p_width_cm,p_length_cm,p_copies,p_waste_cm,nullif(btrim(p_reason),''),auth.uid())
 returning id into v_event;
 return v_event;
end;
$$;

create or replace function public.print_inventory_adjust_roll(
 p_request_id uuid,p_roll_id uuid,p_new_length_m numeric,p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_roll public.print_inventory_rolls%rowtype; v_event uuid; v_payload jsonb;
begin
 perform public.print_inventory_assert_access();
 if p_request_id is null or p_roll_id is null or p_new_length_m is null or p_new_length_m<0
   or length(btrim(coalesce(p_reason,'')))<3 then
  raise exception 'Saldo e motivo são obrigatórios.' using errcode='22023';
 end if;
 v_payload:=jsonb_build_object('kind','ROLL_ADJUST','roll_id',p_roll_id,'new_length_m',p_new_length_m,'reason',btrim(p_reason));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_request_id::text));
 select id into v_event from public.print_inventory_events where request_id=p_request_id;
 if found then
  if not exists(select 1 from public.print_inventory_events e where e.id=v_event and e.kind='ROLL_ADJUST'
    and e.request_payload=v_payload and e.created_by=auth.uid()) then
   raise exception 'Esta operação já foi utilizada com dados diferentes.' using errcode='23505';
  end if;
  return v_event;
 end if;
 select * into v_roll from public.print_inventory_rolls where id=p_roll_id for update;
 if not found then raise exception 'Bobina não encontrada.' using errcode='P0002'; end if;
 if p_new_length_m>v_roll.initial_length_m then
  raise exception 'Saldo ajustado não pode superar a metragem inicial.' using errcode='22023';
 end if;
 update public.print_inventory_rolls set remaining_length_m=p_new_length_m where id=p_roll_id;
 insert into public.print_inventory_events(request_id,request_payload,kind,roll_id,delta_m,reason,created_by)
 values(p_request_id,v_payload,'ROLL_ADJUST',p_roll_id,p_new_length_m-v_roll.remaining_length_m,btrim(p_reason),auth.uid())
 returning id into v_event;
 return v_event;
end;
$$;

create or replace function public.print_inventory_move_ink(
 p_request_id uuid,p_color text,p_quantity_ml numeric,p_entry boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_current numeric; v_delta numeric; v_event uuid; v_payload jsonb;
begin
 perform public.print_inventory_assert_access();
 if p_request_id is null or p_color is null or p_color not in ('C','M','Y','K')
    or p_quantity_ml is null or p_quantity_ml<=0 or p_quantity_ml>100000 then
  raise exception 'Dados inválidos de tinta.' using errcode='22023';
 end if;
 v_payload:=jsonb_build_object('kind',case when coalesce(p_entry,false) then 'INK_IN' else 'INK_USE' end,
   'color',p_color,'quantity_ml',p_quantity_ml);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_request_id::text));
 select id into v_event from public.print_inventory_events where request_id=p_request_id;
 if found then
  if not exists(select 1 from public.print_inventory_events e where e.id=v_event
   and e.kind=case when coalesce(p_entry,false) then 'INK_IN' else 'INK_USE' end
   and e.request_payload=v_payload and e.created_by=auth.uid()) then
   raise exception 'Esta operação já foi utilizada com dados diferentes.' using errcode='23505';
  end if;
  return v_event;
 end if;
 select balance_ml into v_current from public.print_inventory_inks where color=p_color for update;
 if not found then raise exception 'Cor não encontrada.' using errcode='P0002'; end if;
 v_delta:=case when coalesce(p_entry,false) then p_quantity_ml else -p_quantity_ml end;
 if v_current+v_delta<0 then
  raise exception 'Estoque de tinta insuficiente.' using errcode='22023';
 end if;
 update public.print_inventory_inks set balance_ml=balance_ml+v_delta,updated_at=now() where color=p_color;
 insert into public.print_inventory_events(request_id,request_payload,kind,color,delta_ml,created_by)
 values(p_request_id,v_payload,case when coalesce(p_entry,false) then 'INK_IN' else 'INK_USE' end,p_color,v_delta,auth.uid())
 returning id into v_event;
 return v_event;
end;
$$;

revoke all on function public.print_inventory_add_roll(uuid,text,numeric,numeric) from public,anon,authenticated;
revoke all on function public.print_inventory_record_print(uuid,uuid,text,numeric,numeric,integer,numeric,boolean,text) from public,anon,authenticated;
revoke all on function public.print_inventory_adjust_roll(uuid,uuid,numeric,text) from public,anon,authenticated;
revoke all on function public.print_inventory_move_ink(uuid,text,numeric,boolean) from public,anon,authenticated;
grant execute on function public.print_inventory_add_roll(uuid,text,numeric,numeric) to authenticated;
grant execute on function public.print_inventory_record_print(uuid,uuid,text,numeric,numeric,integer,numeric,boolean,text) to authenticated;
grant execute on function public.print_inventory_adjust_roll(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.print_inventory_move_ink(uuid,text,numeric,boolean) to authenticated;
