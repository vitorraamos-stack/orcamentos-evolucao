-- EvoluSystem | Exclusao administrativa de bobinas com historico preservado.
-- Uma bobina excluida fica inativa; eventos anteriores permanecem imutaveis.
alter table public.print_inventory_rolls
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id),
  add column if not exists archived_reason text;

alter table public.print_inventory_rolls
  drop constraint if exists print_inventory_roll_archive_consistency;
alter table public.print_inventory_rolls
  add constraint print_inventory_roll_archive_consistency
  check (
    (archived_at is null and archived_by is null and archived_reason is null)
    or (archived_at is not null and archived_by is not null and length(btrim(archived_reason)) between 3 and 500)
  );

-- A exclusao administrativa e uma movimentacao auditavel, sem alterar o saldo historico.
alter table public.print_inventory_events
  drop constraint if exists print_inventory_events_kind_check;
alter table public.print_inventory_events
  add constraint print_inventory_events_kind_check
  check (kind in ('ROLL_IN','PRINT','REPRINT','ROLL_ADJUST','ROLL_ARCHIVE','INK_IN','INK_USE'));

-- Protecao definitiva contra baixas ou ajustes em bobinas inativas,
-- mesmo se um cliente antigo tentar usar os RPCs preexistentes.
create or replace function public.print_inventory_block_archived_roll_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.archived_at is not null then
    raise exception 'Esta bobina foi excluida do estoque ativo e nao pode ser movimentada.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists print_inventory_block_archived_roll_update on public.print_inventory_rolls;
create trigger print_inventory_block_archived_roll_update
before update on public.print_inventory_rolls for each row
execute function public.print_inventory_block_archived_roll_update();
revoke all on function public.print_inventory_block_archived_roll_update()
from public, anon, authenticated;

create or replace function public.print_inventory_archive_roll(
  p_request_id uuid, p_roll_id uuid, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
  v_roll public.print_inventory_rolls%rowtype;
  v_existing public.print_inventory_events%rowtype;
  v_payload jsonb;
  v_event uuid;
  v_reason text := btrim(coalesce(p_reason,''));
begin
  perform public.print_inventory_assert_access();
  select role into v_role from public.profiles where id = auth.uid();
  if coalesce(v_role,'') not in ('gerente','admin') then
    raise exception 'Apenas administradores podem excluir bobinas.'
      using errcode = '42501';
  end if;
  if p_request_id is null or p_roll_id is null or length(v_reason) not between 3 and 500 then
    raise exception 'Informe a bobina e o motivo da exclusao (3 a 500 caracteres).'
      using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('kind','ROLL_ARCHIVE','roll_id',p_roll_id,'reason',v_reason);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_request_id::text));

  select * into v_existing from public.print_inventory_events where request_id = p_request_id;
  if found then
    if v_existing.kind <> 'ROLL_ARCHIVE' or v_existing.request_payload <> v_payload
       or v_existing.created_by <> auth.uid() then
      raise exception 'Identificador de operacao reutilizado com dados diferentes.'
        using errcode = '23505';
    end if;
    return v_existing.id;
  end if;

  select * into v_roll from public.print_inventory_rolls where id = p_roll_id for update;
  if not found then
    raise exception 'Bobina nao encontrada.' using errcode = 'P0002';
  end if;
  if v_roll.archived_at is not null then
    raise exception 'Esta bobina ja foi excluida do estoque ativo.'
      using errcode = '22023';
  end if;

  update public.print_inventory_rolls
  set archived_at = now(), archived_by = auth.uid(), archived_reason = v_reason
  where id = p_roll_id;

  insert into public.print_inventory_events(
    request_id, request_payload, kind, roll_id, delta_m, reason, created_by
  ) values (
    p_request_id,v_payload,'ROLL_ARCHIVE',p_roll_id,0,v_reason,auth.uid()
  ) returning id into v_event;

  return v_event;
end;
$$;
revoke all on function public.print_inventory_archive_roll(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.print_inventory_archive_roll(uuid,uuid,text) to authenticated;
