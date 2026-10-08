-- 18G Quote negotiation persistence structural/security tests.
begin;
select plan(22);

select has_column(
  'public','quote_snapshots','official_total_selling_price',
  'official total is persisted separately'
);
select has_column(
  'public','quote_snapshots','minimum_allowed_total',
  'protected minimum total is persisted privately'
);
select has_column(
  'public','quote_snapshots','negotiation_private_snapshot',
  'private negotiation evidence is persisted'
);

select ok(
  (
    select is_nullable='YES'
    from information_schema.columns
    where table_schema='public'
      and table_name='quote_snapshots'
      and column_name='official_total_selling_price'
  ),
  'official total remains nullable for legacy/v2 snapshots'
);
select ok(
  (
    select is_nullable='YES'
    from information_schema.columns
    where table_schema='public'
      and table_name='quote_snapshots'
      and column_name='minimum_allowed_total'
  ),
  'minimum total remains nullable for legacy/v2 snapshots'
);
select ok(
  (
    select is_nullable='YES'
    from information_schema.columns
    where table_schema='public'
      and table_name='quote_snapshots'
      and column_name='negotiation_private_snapshot'
  ),
  'negotiation evidence remains nullable for legacy/v2 snapshots'
);

select has_function(
  'public',
  'quote_assert_negotiation_v1',
  array['uuid','numeric','numeric','numeric','jsonb'],
  'negotiation assertion helper exists'
);
select has_function(
  'public',
  'quote_create_with_snapshot_v3_secure',
  array[
    'uuid','text','text','text','jsonb','text','uuid','uuid','integer','integer',
    'uuid','uuid','integer','integer','integer','text','integer','integer','text',
    'timestamp with time zone','numeric','integer','numeric','numeric','numeric',
    'jsonb','jsonb','jsonb','jsonb'
  ],
  'Quote create v3 RPC exists'
);
select has_function(
  'public',
  'quote_append_snapshot_v3_secure',
  array[
    'uuid','integer','uuid','text','text','text','jsonb','text','uuid','uuid',
    'integer','integer','uuid','uuid','integer','integer','integer','text','integer',
    'integer','text','timestamp with time zone','numeric','integer','numeric','numeric',
    'numeric','jsonb','jsonb','jsonb','jsonb'
  ],
  'Quote append v3 RPC exists'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.quote_assert_negotiation_v1(uuid,numeric,numeric,numeric,jsonb)',
    'EXECUTE'
  ),
  'service_role can execute negotiation validator'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.quote_create_with_snapshot_v3_secure(uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'service_role can create Quote v3'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.quote_append_snapshot_v3_secure(uuid,integer,uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'service_role can append Quote v3'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.quote_assert_negotiation_v1(uuid,numeric,numeric,numeric,jsonb)',
    'EXECUTE'
  ),
  'anon cannot execute negotiation validator'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.quote_assert_negotiation_v1(uuid,numeric,numeric,numeric,jsonb)',
    'EXECUTE'
  ),
  'authenticated cannot execute negotiation validator'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.quote_create_with_snapshot_v3_secure(uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'anon cannot create Quote v3'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.quote_create_with_snapshot_v3_secure(uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'authenticated cannot create Quote v3'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.quote_append_snapshot_v3_secure(uuid,integer,uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'anon cannot append Quote v3'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.quote_append_snapshot_v3_secure(uuid,integer,uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'authenticated cannot append Quote v3'
);

select ok(
  not (
    select prosecdef
    from pg_proc
    where oid='public.quote_assert_negotiation_v1(uuid,numeric,numeric,numeric,jsonb)'::regprocedure
  ),
  'negotiation validator is SECURITY INVOKER'
);
select ok(
  not (
    select prosecdef
    from pg_proc
    where oid='public.quote_create_with_snapshot_v3_secure(uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  ),
  'create v3 is SECURITY INVOKER'
);
select ok(
  not (
    select prosecdef
    from pg_proc
    where oid='public.quote_append_snapshot_v3_secure(uuid,integer,uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,numeric,numeric,jsonb,jsonb,jsonb,jsonb)'::regprocedure
  ),
  'append v3 is SECURITY INVOKER'
);

select ok(
  (select relrowsecurity from pg_class where oid='public.quote_snapshots'::regclass),
  'quote_snapshots RLS remains enabled'
);
select ok(
  not has_table_privilege('service_role','public.quote_snapshots','UPDATE'),
  'service_role still cannot mutate immutable snapshots'
);

select * from finish();
rollback;
