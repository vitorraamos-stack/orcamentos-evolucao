-- Hardening de materiais: fluxo transacional + validações + storage path.

set check_function_bodies = off;

alter table public.materials
  add constraint materials_name_not_blank check (char_length(trim(name)) > 0);

alter table public.materials
  add constraint materials_image_url_no_data_url check (
    image_url is null
    or image_url !~* '^data:'
  );

alter table public.price_tiers
  add constraint price_tiers_min_area_non_negative check (min_area >= 0);

alter table public.price_tiers
  add constraint price_tiers_price_non_negative check (price_per_m2 >= 0);

alter table public.price_tiers
  add constraint price_tiers_valid_range check (max_area is null or max_area > min_area);

create or replace function public.upsert_material_with_tiers(
  p_material_id uuid,
  p_name text,
  p_description text,
  p_equivalence_message text,
  p_tipo_calculo text,
  p_min_price numeric,
  p_image_url text,
  p_tiers jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_material_id uuid;
  v_uid uuid := auth.uid();
  v_tier jsonb;
  v_prev_max numeric := null;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if not public.is_manager(v_uid) then
    raise exception 'Apenas gerente pode alterar materiais.' using errcode = '42501';
  end if;

  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'Nome do material é obrigatório.';
  end if;

  if p_tipo_calculo not in ('m2', 'linear') then
    raise exception 'Tipo de cálculo inválido.';
  end if;

  if p_min_price is not null and p_min_price < 0 then
    raise exception 'Preço mínimo não pode ser negativo.';
  end if;

  if p_image_url is not null and p_image_url ~* '^data:' then
    raise exception 'image_url em Data URL/base64 não é permitido.';
  end if;

  if p_tiers is null or jsonb_typeof(p_tiers) <> 'array' or jsonb_array_length(p_tiers) = 0 then
    raise exception 'Informe pelo menos uma faixa de preço.';
  end if;

  if p_material_id is null then
    insert into public.materials (
      name,
      description,
      equivalence_message,
      tipo_calculo,
      min_price,
      image_url
    )
    values (
      trim(p_name),
      nullif(trim(coalesce(p_description, '')), ''),
      nullif(trim(coalesce(p_equivalence_message, '')), ''),
      p_tipo_calculo,
      coalesce(p_min_price, 0),
      nullif(trim(coalesce(p_image_url, '')), '')
    )
    returning id into v_material_id;
  else
    update public.materials
    set
      name = trim(p_name),
      description = nullif(trim(coalesce(p_description, '')), ''),
      equivalence_message = nullif(trim(coalesce(p_equivalence_message, '')), ''),
      tipo_calculo = p_tipo_calculo,
      min_price = coalesce(p_min_price, 0),
      image_url = nullif(trim(coalesce(p_image_url, '')), '')
    where id = p_material_id
    returning id into v_material_id;

    if v_material_id is null then
      raise exception 'Material não encontrado.';
    end if;

    delete from public.price_tiers where material_id = v_material_id;
  end if;

  for v_tier in
    select value
    from jsonb_array_elements(p_tiers)
    order by (value ->> 'min_area')::numeric
  loop
    if coalesce((v_tier ->> 'min_area')::numeric, -1) < 0 then
      raise exception 'Faixa inválida: min_area não pode ser negativo.';
    end if;

    if coalesce((v_tier ->> 'price_per_m2')::numeric, -1) < 0 then
      raise exception 'Faixa inválida: price_per_m2 não pode ser negativo.';
    end if;

    if v_tier ? 'max_area' and (v_tier ->> 'max_area') is not null and (v_tier ->> 'max_area') <> '' then
      if (v_tier ->> 'max_area')::numeric <= (v_tier ->> 'min_area')::numeric then
        raise exception 'Faixa inválida: max_area deve ser maior que min_area.';
      end if;
    end if;

    if v_prev_max is not null and (v_tier ->> 'min_area')::numeric < v_prev_max then
      raise exception 'Faixas sobrepostas não são permitidas.';
    end if;

    insert into public.price_tiers (material_id, min_area, max_area, price_per_m2)
    values (
      v_material_id,
      (v_tier ->> 'min_area')::numeric,
      case
        when not (v_tier ? 'max_area') then null
        when (v_tier ->> 'max_area') is null then null
        when (v_tier ->> 'max_area') = '' then null
        else (v_tier ->> 'max_area')::numeric
      end,
      (v_tier ->> 'price_per_m2')::numeric
    );

    v_prev_max := case
      when not (v_tier ? 'max_area') then null
      when (v_tier ->> 'max_area') is null then null
      when (v_tier ->> 'max_area') = '' then null
      else (v_tier ->> 'max_area')::numeric
    end;
  end loop;

  return v_material_id;
end;
$$;

grant execute on function public.upsert_material_with_tiers(uuid, text, text, text, text, numeric, text, jsonb)
  to authenticated;

insert into storage.buckets (id, name, public)
values ('materials', 'materials', true)
on conflict (id) do nothing;

drop policy if exists "materials_upload_manager_only" on storage.objects;
create policy "materials_upload_manager_only"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'materials'
    and public.is_manager(auth.uid())
  );

drop policy if exists "materials_update_manager_only" on storage.objects;
create policy "materials_update_manager_only"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'materials' and public.is_manager(auth.uid()))
  with check (bucket_id = 'materials' and public.is_manager(auth.uid()));

drop policy if exists "materials_delete_manager_only" on storage.objects;
create policy "materials_delete_manager_only"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'materials' and public.is_manager(auth.uid()));
