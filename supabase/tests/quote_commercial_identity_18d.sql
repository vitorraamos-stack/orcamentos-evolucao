-- 18D Quote commercial identity / central structural security tests.
begin;
select plan(28);

select has_column('public','quotes','customer_name','quotes customer_name exists');
select has_column('public','quotes','customer_phone','quotes customer_phone exists');
select has_column('public','quotes','title','quotes title exists');
select has_column('public','quote_snapshots','commercial_snapshot','snapshot commercial identity exists');

select col_not_null('public','quotes','customer_name','customer_name required');
select col_not_null('public','quotes','title','title required');
select col_not_null('public','quote_snapshots','commercial_snapshot','commercial_snapshot required');

select has_index('public','quotes','quotes_updated_idx','quotes updated index exists');
select has_index('public','quotes','quotes_created_by_updated_idx','quotes owner/update index exists');

select has_function(
  'public',
  'quote_list_secure',
  array['uuid','boolean','text','text','integer','integer'],
  'quote list RPC exists'
);
select has_function(
  'public',
  'quote_get_current_secure',
  array['uuid'],
  'quote current RPC exists'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.quote_list_secure(uuid,boolean,text,text,integer,integer)',
    'EXECUTE'
  ),
  'service_role can list Quotes'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.quote_list_secure(uuid,boolean,text,text,integer,integer)',
    'EXECUTE'
  ),
  'anon cannot list Quotes'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.quote_list_secure(uuid,boolean,text,text,integer,integer)',
    'EXECUTE'
  ),
  'authenticated cannot list Quotes directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.quote_get_current_secure(uuid)',
    'EXECUTE'
  ),
  'service_role can read current Quote'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.quote_get_current_secure(uuid)',
    'EXECUTE'
  ),
  'anon cannot read current Quote RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.quote_get_current_secure(uuid)',
    'EXECUTE'
  ),
  'authenticated cannot read current Quote RPC directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.quote_create_with_snapshot_v2_secure(uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'service_role can create Quote v2'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.quote_create_with_snapshot_v2_secure(uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'anon cannot create Quote v2'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.quote_create_with_snapshot_v2_secure(uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'authenticated cannot create Quote v2 directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.quote_append_snapshot_v2_secure(uuid,integer,uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'service_role can append Quote v2'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.quote_append_snapshot_v2_secure(uuid,integer,uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'anon cannot append Quote v2'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.quote_append_snapshot_v2_secure(uuid,integer,uuid,text,text,text,jsonb,text,uuid,uuid,integer,integer,uuid,uuid,integer,integer,integer,text,integer,integer,text,timestamptz,numeric,integer,numeric,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'authenticated cannot append Quote v2 directly'
);

select ok((select relrowsecurity from pg_class where oid='public.quotes'::regclass),'quotes RLS remains enabled');
select ok((select relrowsecurity from pg_class where oid='public.quote_snapshots'::regclass),'quote_snapshots RLS remains enabled');

select ok(not has_table_privilege('anon','public.quotes','SELECT'),'anon cannot read quotes table');
select ok(not has_table_privilege('authenticated','public.quotes','SELECT'),'authenticated cannot read quotes table directly');
select ok(not has_table_privilege('service_role','public.quote_snapshots','UPDATE'),'snapshots remain immutable for service_role');

select * from finish();
rollback;
