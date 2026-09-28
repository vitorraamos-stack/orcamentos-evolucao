-- Evolução OS 2.0 — Fase 3.2.1a: stabilize item status derivation only.
create or replace function public.hub_os_recompute_item_production_status(p_item_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_current text;
  v_total integer;
  v_required integer;
  v_completed_required integer;
  v_has_active boolean;
begin
  select status into v_current
  from public.os_order_items
  where id=p_item_id and deleted_at is null
  for update;

  if v_current is null or v_current='CANCELLED' then return; end if;

  select count(*),
         count(*) filter (where is_required),
         count(*) filter (where is_required and status='COMPLETED'),
         coalesce(bool_or(status in ('IN_PROGRESS','BLOCKED')), false)
    into v_total, v_required, v_completed_required, v_has_active
  from public.os_order_item_operations
  where item_id=p_item_id and deleted_at is null;

  if v_total=0 then return;
  elsif v_has_active then v_current := 'IN_PROGRESS';
  elsif v_completed_required=v_required then v_current := 'READY';
  else v_current := 'PENDING';
  end if;

  update public.os_order_items set status=v_current, updated_at=now() where id=p_item_id;
end $$;

revoke execute on function public.hub_os_recompute_item_production_status(uuid) from public, anon, authenticated;
