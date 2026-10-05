create or replace function public.product_engineering_guard_draft_child()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  target_version_id uuid;
  parent_status text;
begin
  target_version_id := case when tg_op = 'DELETE'
    then old.product_version_id else new.product_version_id end;

  select status
  into parent_status
  from public.product_versions
  where id = target_version_id
  for update;

  if not found then
    raise exception 'Parent product version does not exist';
  end if;

  if parent_status <> 'DRAFT' then
    raise exception 'Product engineering children are mutable only in DRAFT';
  end if;

  if tg_op = 'UPDATE' and new.product_version_id is distinct from old.product_version_id then
    raise exception 'A product engineering child cannot move between versions';
  end if;

  if tg_op <> 'DELETE' then
    if tg_table_name = 'product_inputs' then
      if exists (
        select 1 from public.product_variables
        where product_version_id = new.product_version_id and key = new.key
      ) then
        raise exception 'Input and variable keys share one namespace';
      end if;
    elsif tg_table_name = 'product_variables' then
      if exists (
        select 1 from public.product_inputs
        where product_version_id = new.product_version_id and key = new.key
      ) then
        raise exception 'Input and variable keys share one namespace';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
