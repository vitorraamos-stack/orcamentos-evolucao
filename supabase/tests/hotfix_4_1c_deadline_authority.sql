begin;
select plan(6);

select has_function(
  'public',
  'hub_os_add_business_days',
  array['date', 'integer'],
  'business-day helper exists'
);
select is(
  public.hub_os_add_business_days(date '2026-10-02', 1),
  date '2026-10-05',
  'business-day calculation skips a weekend'
);
select is(
  public.hub_os_add_business_days(date '2026-09-29', 12),
  date '2026-10-15',
  'STANDARD_8_12 upper bound is twelve business days'
);
select is(
  public.hub_os_add_business_days(date '2026-09-29', 25),
  date '2026-11-03',
  'STRUCTURE_INSTALL_15_25 upper bound is twenty-five business days'
);
select ok(
  position('v_order.delivery_deadline_preset' in pg_get_functiondef(
    'public.hub_os_send_to_production_secure(uuid,timestamptz,date,text,jsonb)'::regprocedure
  )) > 0,
  'handoff uses the preset from the locked order'
);
select ok(
  position('v_started_at timestamptz := now()' in pg_get_functiondef(
    'public.hub_os_send_to_production_secure(uuid,timestamptz,date,text,jsonb)'::regprocedure
  )) > 0,
  'handoff assigns its timestamp on the server'
);

select * from finish();
rollback;
