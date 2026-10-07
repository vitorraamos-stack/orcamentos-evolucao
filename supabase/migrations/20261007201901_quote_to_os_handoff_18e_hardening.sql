create or replace function public.hub_os_create_from_quote_secure(
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
  v_product_name text;
  v_sale text := nullif(trim(coalesce(p_payload->>'sale_number','')),'');
  v_description text := nullif(trim(coalesce(p_payload->>'description','')),'');
  v_deadline text := nullif(trim(coalesce(p_payload->>'delivery_deadline_preset','')),'');
  v_date text := nullif(trim(coalesce(p_payload->>'delivery_date','')),'');
  v_art text := nullif(trim(coalesce(p_payload->>'art_direction_tag','')),'');
  v_address text := nullif(trim(coalesce(p_payload->>'address','')),'');
  v_logistic text;
  v_install boolean;
  v_munck boolean;
  v_munck_hours text;
  v_w jsonb;
  v_h jsonb;
  v_wc numeric;
  v_hc numeric;
  v_customer text;
  v_phone text;
  v_title text;
  v_notes text;
  v_clean jsonb;
begin
  if p_quote_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Payload inválido.' using errcode='22023';
  end if;

  if not public.has_module_access(v_uid,'calculadora') then
    raise exception 'Usuário sem acesso ao módulo calculadora.' using errcode='42501';
  end if;

  select case p.role
    when 'admin' then 'gerente'
    when 'consultor' then 'consultor_vendas'
    else p.role
  end
  into v_role
  from public.profiles p
  where p.id=v_uid;

  if v_role is null or v_role not in ('gerente','consultor_vendas') then
    raise exception 'Perfil sem permissão para converter orçamento em OS.'
      using errcode='42501';
  end if;

  select * into v_quote
  from public.quotes
  where id=p_quote_id
  for update;

  if not found then
    raise exception 'Orçamento não encontrado.' using errcode='P0002';
  end if;

  if v_quote.status <> 'ACCEPTED' then
    raise exception 'Somente orçamento aceito pode gerar OS.'
      using errcode='22023';
  end if;

  if v_role='consultor_vendas' and v_quote.created_by <> v_uid then
    raise exception 'Consultor não pode converter orçamento de outro responsável.'
      using errcode='42501';
  end if;

  select * into v_existing
  from public.os_orders
  where quote_id=p_quote_id
  limit 1;

  if found then
    return v_existing;
  end if;

  select * into v_snapshot
  from public.quote_snapshots
  where id=v_quote.current_snapshot_id
    and quote_id=v_quote.id;

  if not found then
    raise exception 'Snapshot do orçamento não encontrado.'
      using errcode='P0002';
  end if;

  select name into v_product_name
  from public.products
  where id=v_snapshot.product_id;

  if v_product_name is null then
    raise exception 'Produto não encontrado.' using errcode='P0002';
  end if;

  v_install :=
    coalesce((v_snapshot.request_snapshot #>> '{installation,requested}')::boolean,false);
  v_munck :=
    coalesce((v_snapshot.request_snapshot #>> '{munck,requested}')::boolean,false);
  v_munck_hours :=
    nullif(v_snapshot.request_snapshot #>> '{munck,hours}','');

  v_logistic := case
    when v_install then 'instalacao'
    else coalesce(
      nullif(trim(coalesce(p_payload->>'logistic_type','')),''),
      'retirada'
    )
  end;

  if v_sale is null or v_description is null then
    raise exception 'Número da venda e briefing são obrigatórios.'
      using errcode='22023';
  end if;

  if v_art not in ('ARTE_PRONTA_EDICAO','CRIACAO_ARTE') then
    raise exception 'Direcionamento de arte inválido.'
      using errcode='22023';
  end if;

  if v_deadline not in ('FAST_5_8','STANDARD_8_12','STRUCTURE_INSTALL_15_25','CUSTOM') then
    raise exception 'Prazo inválido.' using errcode='22023';
  end if;

  if v_deadline='CUSTOM' and v_date is null then
    raise exception 'Data combinada obrigatória.' using errcode='22023';
  end if;

  if v_logistic not in ('retirada','entrega','instalacao') then
    raise exception 'Logística inválida.' using errcode='22023';
  end if;

  if v_logistic <> 'retirada' and v_address is null then
    raise exception 'Endereço obrigatório.' using errcode='22023';
  end if;

  v_w := v_snapshot.request_snapshot #> '{request,technicalInputs,width}';
  v_h := v_snapshot.request_snapshot #> '{request,technicalInputs,height}';

  if v_w->>'kind'='decimal' then
    v_wc := case v_w->>'unit'
      when 'mm' then (v_w->>'value')::numeric/10
      when 'cm' then (v_w->>'value')::numeric
      when 'm' then (v_w->>'value')::numeric*100
      else null
    end;
  end if;

  if v_h->>'kind'='decimal' then
    v_hc := case v_h->>'unit'
      when 'mm' then (v_h->>'value')::numeric/10
      when 'cm' then (v_h->>'value')::numeric
      when 'm' then (v_h->>'value')::numeric*100
      else null
    end;
  end if;

  v_customer := nullif(trim(coalesce(
    v_snapshot.commercial_snapshot->>'customerName',
    v_quote.customer_name,
    ''
  )),'');
  v_phone := nullif(trim(coalesce(
    v_snapshot.commercial_snapshot->>'customerPhone',
    v_quote.customer_phone,
    ''
  )),'');
  v_title := nullif(trim(coalesce(
    v_snapshot.commercial_snapshot->>'title',
    v_quote.title,
    ''
  )),'');

  if v_customer is null or v_title is null then
    raise exception 'Identidade comercial incompleta.'
      using errcode='22023';
  end if;

  v_notes := concat_ws(
    ' · ',
    format('Origem: Orçamento #%s',v_quote.quote_number),
    format('Snapshot v%s',v_snapshot.version_number),
    case when v_install then 'Inclui instalação' end,
    case when v_munck then
      format('Munck previsto: %sh',coalesce(v_munck_hours,'?'))
    end
  );

  v_clean := jsonb_build_object(
    'sale_number',v_sale,
    'client_name',v_customer,
    'title',v_title,
    'description',v_description,
    'delivery_deadline_preset',v_deadline,
    'delivery_deadline_started_at',null,
    'delivery_date',case when v_deadline='CUSTOM' then v_date else null end,
    'logistic_type',v_logistic,
    'address',case when v_logistic='retirada' then null else v_address end,
    'art_direction_tag',v_art,
    'is_urgent',coalesce((p_payload->>'is_urgent')::boolean,false),
    'is_draft',false,
    'items',jsonb_build_array(
      jsonb_build_object(
        'name',v_product_name,
        'description',v_title,
        'quantity',v_snapshot.commercial_quantity,
        'width_cm',v_wc,
        'height_cm',v_hc,
        'unit','un',
        'notes',v_notes
      )
    ),
    'reproducao',false,
    'letra_caixa',false
  );

  v_created := public.hub_os_create_order_secure(
    v_clean,
    'quote_converted',
    jsonb_build_object(
      'quote_id',v_quote.id,
      'quote_number',v_quote.quote_number,
      'quote_snapshot_id',v_snapshot.id,
      'quote_snapshot_version',v_snapshot.version_number,
      'quote_total',v_snapshot.total_selling_price
    )
  );

  update public.os_orders
  set quote_id=v_quote.id,
      quote_snapshot_id=v_snapshot.id,
      quote_total=v_snapshot.total_selling_price,
      customer_phone=v_phone,
      updated_at=now(),
      updated_by=v_uid
  where id=v_created.id
  returning * into v_created;

  return v_created;
end;
$$;

revoke execute on function public.hub_os_create_from_quote_secure(uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.hub_os_create_from_quote_secure(uuid,jsonb)
  to authenticated;
