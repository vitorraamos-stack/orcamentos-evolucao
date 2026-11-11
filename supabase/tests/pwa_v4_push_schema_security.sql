-- pgTAP security/structure contract for EvoluSystem PWA V4.
-- Run ONLY on a local, disposable database after applying the proposal there.
-- Never execute these tests in production. They perform no production changes.
begin;
select plan(43);

select has_schema('private', 'schema de processamento privado');
select has_table('private','notification_source_outbox','outbox existe');
select has_table('public','user_notifications','notificações do usuário existem');
select has_table('private','push_subscriptions','inscrições privadas existem');
select has_table('private','push_delivery_jobs','fila de entregas existe');

select ok((select relrowsecurity from pg_class where oid='private.notification_source_outbox'::regclass),'outbox tem RLS');
select ok((select relrowsecurity from pg_class where oid='public.user_notifications'::regclass),'histórico tem RLS');
select ok((select relrowsecurity from pg_class where oid='private.push_subscriptions'::regclass),'inscrições têm RLS');
select ok((select relrowsecurity from pg_class where oid='private.push_delivery_jobs'::regclass),'entregas têm RLS');

select ok(not has_table_privilege('anon','private.notification_source_outbox','SELECT'),'anon não lê outbox');
select ok(not has_table_privilege('anon','private.push_subscriptions','SELECT'),'anon não lê inscrições');
select ok(not has_table_privilege('anon','private.push_delivery_jobs','SELECT'),'anon não lê entregas');

select ok(not has_table_privilege('authenticated','private.notification_source_outbox','SELECT'),'autenticado não lê outbox');
select ok(not has_table_privilege('authenticated','private.push_subscriptions','SELECT'),'autenticado não lê inscrições');
select ok(not has_table_privilege('authenticated','private.push_delivery_jobs','SELECT'),'autenticado não lê entregas');

select ok(not has_table_privilege('authenticated','private.notification_source_outbox','INSERT'),'cliente não fabrica eventos');
select ok(not has_table_privilege('authenticated','private.push_subscriptions','INSERT'),'cliente não registra endpoint diretamente');
select ok(not has_table_privilege('authenticated','private.push_delivery_jobs','INSERT'),'cliente não fabrica envios');

select ok(not has_table_privilege('anon','public.user_notifications','SELECT'),'anon não lê histórico');
select ok(has_table_privilege('authenticated','public.user_notifications','SELECT'),'autenticado tem grant SELECT sujeito a RLS');
select ok(has_column_privilege('authenticated','public.user_notifications','read_at','UPDATE'),'cliente pode marcar leitura');
select ok(not has_column_privilege('authenticated','public.user_notifications','recipient_id','UPDATE'),'cliente não pode alterar destinatário');
select ok(not has_table_privilege('authenticated','public.user_notifications','INSERT'),'cliente não fabrica avisos');
select ok(not has_table_privilege('authenticated','public.user_notifications','DELETE'),'cliente não apaga histórico');

select ok(has_table_privilege('service_role','private.notification_source_outbox','SELECT'),'servidor lê eventos');
select ok(has_table_privilege('service_role','private.push_subscriptions','INSERT'),'servidor registra inscrição');
select ok(has_table_privilege('service_role','private.push_delivery_jobs','UPDATE'),'servidor gerencia fila');

select ok(not has_schema_privilege('authenticated','private','USAGE'),'autenticado não alcança esquema privado');
select ok(not has_schema_privilege('anon','private','USAGE'),'anon não alcança esquema privado');
select ok(has_schema_privilege('service_role','private','USAGE'),'servidor alcança esquema privado');

select is(
  (select count(*)::integer from pg_policies where schemaname='public'
   and tablename='user_notifications' and cmd='SELECT' and roles::text like '%authenticated%'),
  1, 'exatamente uma policy de leitura autenticada'
);
select is(
  (select count(*)::integer from pg_policies where schemaname='public'
   and tablename='user_notifications' and cmd='UPDATE' and roles::text like '%authenticated%'),
  1, 'exatamente uma policy de atualização autenticada'
);
select ok(
  (select position('recipient_id' in lower(qual)) > 0 and position('has_module_access' in lower(qual)) > 0
   from pg_policies where schemaname='public' and tablename='user_notifications' and cmd='SELECT'),
  'SELECT exige destinatário e módulos'
);
select ok(
  (select position('recipient_id' in lower(qual)) > 0
   from pg_policies where schemaname='public' and tablename='user_notifications' and cmd='UPDATE'),
  'UPDATE exige destinatário'
);
select ok(
  (select position('recipient_id' in lower(with_check)) > 0
   from pg_policies where schemaname='public' and tablename='user_notifications' and cmd='UPDATE'),
  'UPDATE tem WITH CHECK de destinatário'
);

select ok(
  exists(select 1 from pg_constraint where conrelid='public.user_notifications'::regclass
    and conname='user_notifications_kind_module_ck'),
  'tipo e módulo compatíveis por constraint'
);
select ok(
  exists(select 1 from pg_constraint where conrelid='public.user_notifications'::regclass
    and conname='user_notifications_source_recipient_unique' and contype='u'),
  'um aviso por evento/destinatário'
);
select ok(
  exists(select 1 from pg_constraint where conrelid='private.notification_source_outbox'::regclass
    and contype='u' and pg_get_constraintdef(oid) like '%source_key%'),
  'source_key é única'
);
select ok(
  exists(select 1 from pg_constraint where conrelid='private.push_subscriptions'::regclass
    and contype='u' and pg_get_constraintdef(oid) like '%endpoint_hash%'),
  'mesmo endpoint não pode ser compartilhado entre usuários'
);
select ok(
  exists(select 1 from pg_constraint where conrelid='private.push_delivery_jobs'::regclass
    and conname='push_delivery_jobs_once' and contype='u'),
  'um job por aviso/dispositivo'
);
select is(
  (select count(*)::integer from pg_policies
   where schemaname='private' and tablename in
   ('notification_source_outbox','push_subscriptions','push_delivery_jobs')),
  0, 'sem policies de acesso direto às tabelas privadas'
);
select is(
  (select count(*)::integer from pg_trigger tg
   join pg_class c on c.oid=tg.tgrelid
   join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in ('private','public') and
   c.relname in ('notification_source_outbox','user_notifications','push_subscriptions','push_delivery_jobs')
   and not tg.tgisinternal),
  0, 'não existem triggers de despacho nesta etapa'
);
select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='private' and p.proname like 'push_%'),
  0, 'nenhuma função de despacho criada'
);

select * from finish();
rollback;
