-- 18E — Quote ACCEPTED → OS assisted handoff.

alter table public.os_orders
  add column quote_id uuid,
  add column quote_snapshot_id uuid,
  add column quote_total numeric(12,2),
  add column customer_phone text;

alter table public.os_orders
  add constraint os_orders_quote_id_fkey
    foreign key (quote_id)
    references public.quotes(id)
    on delete restrict,
  add constraint os_orders_quote_snapshot_fkey
    foreign key (quote_snapshot_id, quote_id)
    references public.quote_snapshots(id, quote_id)
    on delete restrict,
  add constraint os_orders_quote_link_complete
    check (
      (quote_id is null and quote_snapshot_id is null and quote_total is null)
      or
      (quote_id is not null and quote_snapshot_id is not null and quote_total is not null)
    ),
  add constraint os_orders_quote_total_nonnegative
    check (quote_total is null or quote_total >= 0);

create unique index os_orders_quote_id_unique
  on public.os_orders(quote_id)
  where quote_id is not null;

create function public.hub_os_create_from_quote_secure(
  p_quote_id uuid,
  p_payload jsonb
)
returns public.os_orders
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := public.hub_os_assert_orders_access();
  v_role text;
  v_quote public.quotes;
  v_snapshot public.quote_snapshots;
  v_existing public.os_orders;
  v_created public.os_orders;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_product_name text;
  v_quantity numeric;
  v_width jsonb;
  v_height jsonb;
  v_width_cm numeric;
  v_height_cm numeric;
  v_installation_requested boolean := false;
  v_munck_requested boolean := false;
  v_munck_hours text;
  v_item_notes text;
  v_logistic_type text;
  v_deadline text;
begin
  if p_quote_id is null then
    raise exception 'Quote obrigatório.' using errcode = '22023';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Payload inválido.' using errcode = '22023';
  end if;

  select case p.role
    when 'admin' then 'gerente'
    when 'consultor' then 'consultor_vendas'
    else p.role
  end
  into v_role
  from public.profiles p
  where p.id = v_uid;

  if v_role is null or v_role not in ('gerente', 'consultor_vendas') then
    raise exception 'Somente gerente ou consultor de vendas pode converter orçamento em OS.'
      using errcode = '42501';
  end if;

  select q.*
  into v_quote
  from public.quotes q
  where q.id = p_quote_id
  for update;

  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0002';
  end if;

  if v_quote.status <> 'ACCEPTED' then
    raise exception 'Somente orçamento aceito pode gerar OS.' using errcode = '22023';
  end if;

  if v_role = 'consultor_vendas' and v_quote.created_by <> v_uid then
    raise exception 'Consultor não pode converter orçamento de outro responsável.'
      using errcode = '42501';
  end if;

  select o.*
  into v_existing
  from public.os_orders o
  where o.quote_id = p_quote_id
  limit 1;

  if found then
    return v_existing;
  end if;

  select s.*
  into v_snapshot
  from public.quote_snapshots s
  where s.id = v_quote.current_snapshot_id
    and s.quote_id = v_quote.id;

  if not found then
    raise exception 'Snapshot atual do orçamento não encontrado.'
      using errcode = 'P0002';
  end if;

  if coalesce((v_payload->>'is_draft')::boolean, false) then
    raise exception 'Conversão de orçamento não aceita criação como rascunho.'
      using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(v_payload->>'sale_number','')), '') is null then
    raise exception 'Informe o número da venda.' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(v_payload->>'description','')), '') is null then
    raise exception 'Informe o briefing da OS.' using errcode = '22023';
  end if;

  v_deadline := nullif(btrim(coalesce(v_payload->>'delivery_deadline_preset','')), '');
  if v_deadline is null
     or v_deadline not in ('FAST_5_8','STANDARD_8_12','STRUCTURE_INSTALL_15_25','CUSTOM') then
    raise exception 'Informe um prazo de produção válido.' using errcode = '22023';
  end if;

  if v_deadline = 'CUSTOM'
     and nullif(btrim(coalesce(v_payload->>'delivery_date','')), '') is null then
    raise exception 'Informe a data combinada para o prazo personalizado.' using errcode = '22023';
  end if;

  select p.name
  into v_product_name
  from public.products p
  where p.id = v_snapshot.product_id;

  if v_product_name is null then
    raise exception 'Produto do orçamento não encontrado.' using errcode = 'P0002';
  end if;

  v_quantity :=
    nullif(v_snapshot.request_snapshot #>> '{request,commercialQuantity}', '')::numeric;
  if v_quantity is null or v_quantity <= 0 then
    raise exception 'Quantidade comercial do snapshot é inválida.' using errcode = '22023';
  end if;

  v_width := v_snapshot.request_snapshot #> '{request,technicalInputs,width}';
  v_height := v_snapshot.request_snapshot #> '{request,technicalInputs,height}';

  if v_width->>'kind' = 'decimal' then
    v_width_cm := case v_width->>'unit'
      when 'mm' then (v_width->>'value')::numeric / 10
      when 'cm' then (v_width->>'value')::numeric
      when 'm' then (v_width->>'value')::numeric * 100
      else null
    end;
  end if;

  if v_height->>'kind' = 'decimal' then
    v_height_cm := case v_height->>'unit'
      when 'mm' then (v_height->>'value')::numeric / 10
      when 'cm' then (v_height->>'value')::numeric
      when 'm' then (v_height->>'value')::numeric * 100
      else null
    end;
  end if;

  v_installation_requested :=
    coalesce((v_snapshot.request_snapshot #>> '{installation,requested}')::boolean, false);
  v_munck_requested :=
    coalesce((v_snapshot.request_snapshot #>> '{munck,requested}')::boolean, false);
  v_munck_hours := nullif(v_snapshot.request_snapshot #>> '{munck,hours}', '');

  v_item_notes :=
    format(
      'Origem: Orçamento #%s · Snapshot v%s',
      v_quote.quote_number,
      v_snapshot.version_number
    );
  if v_installation_requested then
    v_item_notes := v_item_notes || ' · Inclui instalação';
  end if;
  if v_munck_requested then
    v_item_notes := v_item_notes || ' · Munck previsto: ' ||
      coalesce(v_munck_hours, 'não informado') || 'h';
  end if;

  v_logistic_type :=
    case
      when v_installation_requested then 'instalacao'
      else coalesce(
        nullif(btrim(coalesce(v_payload->>'logistic_type','')), ''),
        'retirada'
      )
    end;

  if v_logistic_type not in ('retirada','entrega','instalacao') then
    raise exception 'Tipo de logística inválido.' using errcode = '22023';
  end if;

  if v_logistic_type <> 'retirada'
     and nullif(btrim(coalesce(v_payload->>'address','')), '') is null then
    raise exception 'Informe o endereço do serviço.' using errcode = '22023';
  end if;

  v_payload :=
    v_payload
      - 'quote_id'
      - 'quote_snapshot_id'
      - 'quote_total'
      - 'customer_phone'
      - 'client_name'
      - 'title'
      - 'items'
      - 'created_by'
      - 'updated_by'
      - 'art_status'
      - 'prod_status'
      - 'archived'
    || jsonb_build_object(
      'client_name', v_quote.customer_name,
      'title', v_quote.title,
      'logistic_type', v_logistic_type,
      'is_draft', false,
      'items', jsonb_build_array(
        jsonb_build_object(
          'name', v_product_name,
          'description', v_quote.title,
          'quantity', v_quantity,
          'width_cm', v_width_cm,
          'height_cm', v_height_cm,
          'unit', 'un',
          'notes', v_item_notes
        )
      )
    );

  v_created := public.hub_os_create_order_secure(
    v_payload,
    'quote_converted',
    jsonb_build_object(
      'quote_id', v_quote.id,
      'quote_number', v_quote.quote_number,
      'quote_snapshot_id', v_snapshot.id,
      'quote_snapshot_version', v_snapshot.version_number,
      'quote_total', v_snapshot.total_selling_price
    )
  );

  update public.os_orders
  set quote_id = v_quote.id,
      quote_snapshot_id = v_snapshot.id,
      quote_total = v_snapshot.total_selling_price,
      customer_phone = v_quote.customer_phone,
      updated_at = now(),
      updated_by = v_uid
  where id = v_created.id
  returning * into v_created;

  return v_created;
end;
$$;

revoke all on function public.hub_os_create_from_quote_secure(uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.hub_os_create_from_quote_secure(uuid,jsonb)
  to authenticated;
