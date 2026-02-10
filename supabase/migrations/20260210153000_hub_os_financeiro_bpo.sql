-- Hub OS Financeiro (BPO)

insert into public.app_modules (module_key, label, route_prefixes)
values ('hub_os_financeiro', 'Financeiro', '["/hub-os/financeiro", "/financeiro"]'::jsonb)
on conflict (module_key) do update
set label = excluded.label,
    route_prefixes = excluded.route_prefixes;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'finance_installment_status') then
    create type public.finance_installment_status as enum (
      'AWAITING_PROOF',
      'PENDING_REVIEW',
      'CONCILIADO',
      'LANCADO',
      'REJEITADO',
      'CADASTRO_PENDENTE'
    );
  end if;
end $$;

create table if not exists public.os_finance_installments (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.os_orders(id) on delete cascade,
  installment_no int not null check (installment_no in (1, 2)),
  total_installments int not null check (total_installments in (1, 2)),
  due_date date null,
  asset_id uuid null references public.os_order_assets(id) on delete set null,
  status public.finance_installment_status not null,
  notes text null,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  reviewed_by uuid null references auth.users(id) on delete set null,
  check (installment_no <= total_installments),
  check (
    not (total_installments = 2 and installment_no = 2 and due_date is null)
  ),
  unique (os_id, installment_no)
);

create index if not exists os_finance_installments_status_idx on public.os_finance_installments(status);
create index if not exists os_finance_installments_os_id_idx on public.os_finance_installments(os_id);
create index if not exists os_finance_installments_asset_id_idx on public.os_finance_installments(asset_id);

create or replace function public.finance_upsert_from_asset(
  p_os_id uuid,
  p_asset_id uuid,
  p_installment_label text,
  p_second_due_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_installment_label not in ('1/1', '1/2', '2/2') then
    raise exception 'Parcela inválida: %', p_installment_label;
  end if;

  if p_installment_label = '1/1' then
    insert into public.os_finance_installments (
      os_id, installment_no, total_installments, asset_id, status, due_date, created_by
    )
    values (
      p_os_id, 1, 1, p_asset_id, 'PENDING_REVIEW', null, auth.uid()
    )
    on conflict (os_id, installment_no)
    do update set
      total_installments = excluded.total_installments,
      asset_id = excluded.asset_id,
      status = excluded.status,
      due_date = null;

    delete from public.os_finance_installments
    where os_id = p_os_id
      and installment_no = 2;

    return;
  end if;

  if p_installment_label = '1/2' then
    if p_second_due_date is null then
      raise exception 'Data da 2ª parcela é obrigatória para 1/2';
    end if;

    insert into public.os_finance_installments (
      os_id, installment_no, total_installments, asset_id, status, due_date, created_by
    )
    values (
      p_os_id, 1, 2, p_asset_id, 'PENDING_REVIEW', null, auth.uid()
    )
    on conflict (os_id, installment_no)
    do update set
      total_installments = excluded.total_installments,
      asset_id = excluded.asset_id,
      status = excluded.status,
      due_date = null;

    insert into public.os_finance_installments (
      os_id, installment_no, total_installments, asset_id, status, due_date, created_by
    )
    values (
      p_os_id, 2, 2, null, 'AWAITING_PROOF', p_second_due_date, auth.uid()
    )
    on conflict (os_id, installment_no)
    do update set
      total_installments = 2,
      due_date = excluded.due_date,
      asset_id = null,
      status = 'AWAITING_PROOF';

    return;
  end if;

  if p_installment_label = '2/2' then
    if not exists (
      select 1
      from public.os_finance_installments
      where os_id = p_os_id
        and installment_no = 2
        and total_installments = 2
    ) then
      raise exception 'Parcela 2/2 não encontrada para a OS %', p_os_id;
    end if;

    update public.os_finance_installments
    set asset_id = p_asset_id,
        status = 'PENDING_REVIEW'
    where os_id = p_os_id
      and installment_no = 2;

    return;
  end if;
end;
$$;

grant execute on function public.finance_upsert_from_asset(uuid, uuid, text, date) to authenticated;

create or replace function public.os_finance_installment_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (old.status is distinct from new.status) or (old.notes is distinct from new.notes) then
    insert into public.os_orders_event (os_id, type, payload, created_by, created_at)
    values (
      new.os_id,
      'FINANCE_INSTALLMENT_STATUS_CHANGED',
      jsonb_build_object(
        'installment_no', new.installment_no,
        'total_installments', new.total_installments,
        'old_status', old.status,
        'new_status', new.status,
        'asset_id', new.asset_id,
        'notes', new.notes
      ),
      auth.uid(),
      now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_os_finance_installment_audit on public.os_finance_installments;
create trigger trg_os_finance_installment_audit
after update of status, notes on public.os_finance_installments
for each row
execute function public.os_finance_installment_audit_trigger();

alter table public.os_finance_installments enable row level security;

drop policy if exists "os_finance_installments_select" on public.os_finance_installments;
create policy "os_finance_installments_select"
  on public.os_finance_installments for select
  to authenticated
  using (
    public.has_module_access(auth.uid(), 'hub_os')
    or public.has_module_access(auth.uid(), 'hub_os_financeiro')
  );

drop policy if exists "os_finance_installments_insert" on public.os_finance_installments;
create policy "os_finance_installments_insert"
  on public.os_finance_installments for insert
  to authenticated
  with check (public.has_module_access(auth.uid(), 'hub_os'));

drop policy if exists "os_finance_installments_update_financeiro" on public.os_finance_installments;
create policy "os_finance_installments_update_financeiro"
  on public.os_finance_installments for update
  to authenticated
  using (public.has_module_access(auth.uid(), 'hub_os_financeiro'))
  with check (public.has_module_access(auth.uid(), 'hub_os_financeiro'));

drop policy if exists "os_finance_installments_delete_admin" on public.os_finance_installments;
create policy "os_finance_installments_delete_admin"
  on public.os_finance_installments for delete
  to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "os_order_assets_select_authenticated" on public.os_order_assets;
create policy "os_order_assets_select_authenticated"
  on public.os_order_assets
  for select
  to authenticated
  using (
    public.has_module_access(auth.uid(), 'hub_os')
    or public.has_module_access(auth.uid(), 'hub_os_financeiro')
  );

-- keep existing update/insert restrictions for hub_os only

drop policy if exists "os_orders_select_authenticated" on public.os_orders;
create policy "os_orders_select_authenticated"
  on public.os_orders
  for select
  to authenticated
  using (
    public.has_module_access(auth.uid(), 'hub_os')
    or public.has_module_access(auth.uid(), 'hub_os_financeiro')
  );

drop policy if exists "os_orders_event_select_admin" on public.os_orders_event;
create policy "os_orders_event_select_admin"
  on public.os_orders_event
  for select
  to authenticated
  using (
    (public.has_module_access(auth.uid(), 'hub_os') and public.is_admin(auth.uid()))
    or public.has_module_access(auth.uid(), 'hub_os_financeiro')
  );

drop policy if exists "os_orders_event_insert_authenticated" on public.os_orders_event;
create policy "os_orders_event_insert_authenticated"
  on public.os_orders_event
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and (
      public.has_module_access(auth.uid(), 'hub_os')
      or public.has_module_access(auth.uid(), 'hub_os_financeiro')
    )
  );
