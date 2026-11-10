-- pgTAP: datas fixadas na criação, sem depender da aprovação da Arte.
begin;
select plan(6);

insert into public.os_orders(
  id, sale_number, client_name, art_status, created_at,
  delivery_deadline_preset, delivery_deadline_started_at, delivery_date
) values (
  'ca17aaaa-1111-4111-8111-aaaaaaaaaaaa', 'TEST-DEADLINE-ART-1', 'Teste prazo',
  'Caixa de Entrada', '2026-11-06 12:00:00-03',
  'FAST_5_8', null, null
), (
  'ca17aaaa-2222-4222-8222-aaaaaaaaaaaa', 'TEST-DEADLINE-ART-2', 'Teste prazo',
  'Caixa de Entrada', '2026-11-06 12:00:00-03',
  'STRUCTURE_INSTALL_15_25', null, null
), (
  'ca17aaaa-3333-4333-8333-aaaaaaaaaaaa', 'TEST-DEADLINE-ART-3', 'Teste prazo',
  'Caixa de Entrada', '2026-11-06 12:00:00-03',
  'CUSTOM', null, '2026-12-12'
);

select is(
  (select delivery_date from public.os_orders where sale_number = 'TEST-DEADLINE-ART-1'),
  date '2026-11-18', 'prazo rápido usa 8 dias úteis desde sexta-feira'
);
select is(
  (select delivery_date from public.os_orders where sale_number = 'TEST-DEADLINE-ART-2'),
  public.hub_os_add_business_days(date '2026-11-06', 25),
  'prazo de estrutura usa 25 dias úteis desde criação'
);
select is(
  (select (delivery_deadline_started_at at time zone 'America/Sao_Paulo')::date from public.os_orders where sale_number = 'TEST-DEADLINE-ART-1'),
  date '2026-11-06', 'contagem começa na criação'
);
select is(
  (select delivery_date from public.os_orders where sale_number = 'TEST-DEADLINE-ART-3'),
  date '2026-12-12', 'prazo personalizado mantém data contratada'
);
select ok(
  position('coalesce(v_order.delivery_date' in pg_get_functiondef(
    'public.hub_os_send_to_production_secure(uuid,timestamptz,date,text,jsonb)'::regprocedure
  )) > 0,
  'handoff conserva data calculada na criação'
);
select ok(
  position('v_order.delivery_deadline_started_at' in pg_get_functiondef(
    'public.hub_os_send_to_production_secure(uuid,timestamptz,date,text,jsonb)'::regprocedure
  )) > 0,
  'handoff conserva início original da contagem'
);
select * from finish();
rollback;
