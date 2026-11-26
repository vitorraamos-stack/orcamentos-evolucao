-- Run ONLY against a disposable local database with the candidate SQL installed.
-- Deliberately outside supabase/tests until a migration is generated and validated.
begin;
select plan(42);
insert into auth.users(id,email) values
  ('cb200000-0000-4000-8000-000000000001','brief-owner@test.local'),
  ('cb200000-0000-4000-8000-000000000002','brief-other@test.local'),
  ('cb200000-0000-4000-8000-000000000003','brief-manager@test.local'),
  ('cb200000-0000-4000-8000-000000000004','brief-art@test.local'),
  ('cb200000-0000-4000-8000-000000000005','brief-no-module@test.local');
update public.profiles set role = 'consultor_vendas' where id in ('cb200000-0000-4000-8000-000000000001','cb200000-0000-4000-8000-000000000002','cb200000-0000-4000-8000-000000000005');
update public.profiles set role = 'gerente' where id = 'cb200000-0000-4000-8000-000000000003';
update public.profiles set role = 'arte_finalista' where id = 'cb200000-0000-4000-8000-000000000004';
insert into public.user_module_access(user_id,module_key) values
  ('cb200000-0000-4000-8000-000000000001','hub_os'),('cb200000-0000-4000-8000-000000000002','hub_os'),('cb200000-0000-4000-8000-000000000003','hub_os'),('cb200000-0000-4000-8000-000000000004','hub_os')
  on conflict do nothing;
delete from public.user_module_access where user_id='cb200000-0000-4000-8000-000000000005' and module_key='hub_os';
select ok(not has_table_privilege('anon','public.commercial_briefings','SELECT'),'anon cannot read');
select ok(not has_function_privilege('anon','public.commercial_briefing_create(uuid,text,text,jsonb)','EXECUTE'),'anon cannot create');
select ok(not has_table_privilege('authenticated','public.commercial_briefings','INSERT'),'no direct insert');
select ok(not has_table_privilege('authenticated','public.commercial_briefings','UPDATE'),'no direct update');
select ok(not has_table_privilege('authenticated','public.commercial_briefings','DELETE'),'no direct delete');
select ok(not has_table_privilege('authenticated','public.commercial_briefing_revisions','INSERT'),'no direct audit insert');
select ok(not has_table_privilege('authenticated','public.commercial_briefing_revisions','UPDATE'),'no direct audit update');
select ok(not has_table_privilege('authenticated','public.commercial_briefing_revisions','DELETE'),'no direct audit delete');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.commercial_briefings'::regclass,'public.commercial_briefing_revisions'::regclass)),'both tables have RLS');
select ok(not (select prosecdef from pg_proc where oid='public.commercial_briefing_save(uuid,integer,jsonb)'::regprocedure),'public save wrapper is invoker');
set local role authenticated;
select set_config('request.jwt.claim.sub','cb200000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.commercial_briefing_create('cb210000-0000-4000-8000-000000000001','contact-fixture','ticket-fixture','{"saleNumber":"","clientName":"","items":[],"commercialNotes":"","artInstructions":"","artDirectionTag":null,"isUrgent":false,"deadlinePreset":null,"deliveryDate":"","logisticType":null,"address":""}'::jsonb)$$,'owner creates an incomplete draft');
select lives_ok($$select public.commercial_briefing_create('cb210000-0000-4000-8000-000000000001','contact-fixture','ticket-fixture','{"saleNumber":"","clientName":"","items":[],"commercialNotes":"","artInstructions":"","artDirectionTag":null,"isUrgent":false,"deadlinePreset":null,"deliveryDate":"","logisticType":null,"address":""}'::jsonb)$$,'create retry is idempotent');
select is((select count(*)::integer from public.commercial_briefing_revisions where briefing_id='cb210000-0000-4000-8000-000000000001'),1,'no duplicate creation event');
select lives_ok($$select public.commercial_briefing_create('cb210000-0000-4000-8000-000000000002','contact-fixture','ticket-fixture','{"saleNumber":"","clientName":"","items":[],"commercialNotes":"","artInstructions":"","artDirectionTag":null,"isUrgent":false,"deadlinePreset":null,"deliveryDate":"","logisticType":null,"address":""}'::jsonb)$$,'second negotiation for same contact and ticket');
select is((select count(*)::integer from public.commercial_briefings where digisac_contact_id='contact-fixture'),2,'same contact can have two records');
select ok((select consultant_id='cb200000-0000-4000-8000-000000000001'::uuid and context_verified_at is null and confirmation is null and os_id is null from public.commercial_briefings where id='cb210000-0000-4000-8000-000000000001'),'ownership derived; external context unverified; no approval or OS');
select lives_ok($$select public.commercial_briefing_save('cb210000-0000-4000-8000-000000000001',1,'{"saleNumber":"","clientName":"","items":[],"commercialNotes":"","artInstructions":"Internal note","artDirectionTag":null,"isUrgent":false,"deadlinePreset":null,"deliveryDate":"","logisticType":null,"address":""}'::jsonb)$$,'save internal information');
select is((select revision from public.commercial_briefings where id='cb210000-0000-4000-8000-000000000001'),2,'general revision increases');
select is((select commercial_revision from public.commercial_briefings where id='cb210000-0000-4000-8000-000000000001'),1,'internal information leaves commercial revision unchanged');
select lives_ok($$select public.commercial_briefing_save('cb210000-0000-4000-8000-000000000001',2,'{"saleNumber":"","clientName":"Cliente Teste","items":[],"commercialNotes":"","artInstructions":"Internal note","artDirectionTag":null,"isUrgent":false,"deadlinePreset":"FAST_5_8","deliveryDate":"","logisticType":null,"address":""}'::jsonb)$$,'save commercial change');
select is((select commercial_revision from public.commercial_briefings where id='cb210000-0000-4000-8000-000000000001'),2,'commercial revision increases');
select throws_ok($$select public.commercial_briefing_save('cb210000-0000-4000-8000-000000000001',2,'{"saleNumber":"","clientName":"","items":[],"commercialNotes":"","artInstructions":"Internal note","artDirectionTag":null,"isUrgent":false,"deadlinePreset":null,"deliveryDate":"","logisticType":null,"address":""}'::jsonb)$$,'40001','Revisão desatualizada.','stale autosave cannot overwrite');
select is((select draft->>'clientName' from public.commercial_briefings where id='cb210000-0000-4000-8000-000000000001'),'Cliente Teste','stale write did not change data');
select lives_ok($$select public.commercial_briefing_save('cb210000-0000-4000-8000-000000000001',3,'{"saleNumber":"","clientName":"Cliente Teste","items":[],"commercialNotes":"","artInstructions":"Internal note","artDirectionTag":null,"isUrgent":false,"deadlinePreset":"FAST_5_8","deliveryDate":"","logisticType":null,"address":""}'::jsonb)$$,'identical save is a no-op');
select is((select count(*)::integer from public.commercial_briefing_revisions where briefing_id='cb210000-0000-4000-8000-000000000001'),3,'no duplicate audit on unchanged save');
select throws_ok($$select public.commercial_briefing_save('cb210000-0000-4000-8000-000000000001',3,'{"saleNumber":"","clientName":"Cliente Teste","items":[],"commercialNotes":"","artInstructions":"Internal note","artDirectionTag":null,"isUrgent":false,"deadlinePreset":"FAST_5_8","deliveryDate":"","logisticType":null,"address":"","consultantId":"cb200000-0000-4000-8000-000000000002"}'::jsonb)$$,'22023','Rascunho inválido.','metadata injection rejected');
select throws_ok($$select public.commercial_briefing_save('cb210000-0000-4000-8000-000000000001',3,'{"saleNumber":"","clientName":"Cliente Teste","items":[],"commercialNotes":"","artInstructions":"Internal note","artDirectionTag":null,"isUrgent":false,"deadlinePreset":"UNKNOWN","deliveryDate":"","logisticType":null,"address":""}'::jsonb)$$,'22023','Rascunho inválido.','unknown deadline rejected');
select set_config('request.jwt.claim.sub','cb200000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.commercial_briefings where id='cb210000-0000-4000-8000-000000000001'),0,'other consultant cannot read briefing');
select is((select count(*)::integer from public.commercial_briefing_revisions where briefing_id='cb210000-0000-4000-8000-000000000001'),0,'other consultant cannot read history');
select throws_ok($$select public.commercial_briefing_save('cb210000-0000-4000-8000-000000000001',3,'{"saleNumber":"","clientName":"Cliente Teste","items":[],"commercialNotes":"","artInstructions":"Internal note","artDirectionTag":null,"isUrgent":false,"deadlinePreset":"FAST_5_8","deliveryDate":"","logisticType":null,"address":""}'::jsonb)$$,'42501','Acesso negado.','other consultant cannot write');
select throws_ok($$select public.commercial_briefing_create('cb210000-0000-4000-8000-000000000001','contact-fixture','ticket-fixture','{"saleNumber":"","clientName":"","items":[],"commercialNotes":"","artInstructions":"","artDirectionTag":null,"isUrgent":false,"deadlinePreset":null,"deliveryDate":"","logisticType":null,"address":""}'::jsonb)$$,'42501','Acesso negado.','other consultant cannot claim existing UUID');
select set_config('request.jwt.claim.sub','cb200000-0000-4000-8000-000000000003',true);
select is((select count(*)::integer from public.commercial_briefings where digisac_contact_id='contact-fixture'),2,'manager can read team briefings');
select is((select count(*)::integer from public.commercial_briefing_revisions where briefing_id='cb210000-0000-4000-8000-000000000001'),3,'manager can read history');
select throws_ok($$select public.commercial_briefing_save('cb210000-0000-4000-8000-000000000001',3,'{"saleNumber":"","clientName":"Cliente Teste","items":[],"commercialNotes":"","artInstructions":"Internal note","artDirectionTag":null,"isUrgent":false,"deadlinePreset":"FAST_5_8","deliveryDate":"","logisticType":null,"address":""}'::jsonb)$$,'42501','Acesso negado.','manager cannot silently edit another owner in this stage');
select set_config('request.jwt.claim.sub','cb200000-0000-4000-8000-000000000004',true);
select is((select count(*)::integer from public.commercial_briefings where id='cb210000-0000-4000-8000-000000000001'),0,'art role cannot read');
select throws_ok($$select public.commercial_briefing_create('cb210000-0000-4000-8000-000000000003','contact-fixture','ticket-fixture','{"saleNumber":"","clientName":"","items":[],"commercialNotes":"","artInstructions":"","artDirectionTag":null,"isUrgent":false,"deadlinePreset":null,"deliveryDate":"","logisticType":null,"address":""}'::jsonb)$$,'42501','Acesso negado.','art role cannot create');
select set_config('request.jwt.claim.sub','cb200000-0000-4000-8000-000000000005',true);
select is((select count(*)::integer from public.commercial_briefings where id='cb210000-0000-4000-8000-000000000001'),0,'consultant without module cannot read');
select throws_ok($$select public.commercial_briefing_create('cb210000-0000-4000-8000-000000000004','contact-fixture','ticket-fixture','{"saleNumber":"","clientName":"","items":[],"commercialNotes":"","artInstructions":"","artDirectionTag":null,"isUrgent":false,"deadlinePreset":null,"deliveryDate":"","logisticType":null,"address":""}'::jsonb)$$,'42501','Acesso negado.','consultant without module cannot create');
select set_config('request.jwt.claim.sub','cb200000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.commercial_briefing_cancel('cb210000-0000-4000-8000-000000000001',3)$$,'owner cancels without deleting');
select ok((select cancelled_at is not null and revision=4 from public.commercial_briefings where id='cb210000-0000-4000-8000-000000000001'),'cancel records revision');
select throws_ok($$select public.commercial_briefing_save('cb210000-0000-4000-8000-000000000001',4,'{"saleNumber":"","clientName":"Cliente Teste","items":[],"commercialNotes":"","artInstructions":"Internal note","artDirectionTag":null,"isUrgent":false,"deadlinePreset":"FAST_5_8","deliveryDate":"","logisticType":null,"address":""}'::jsonb)$$,'22023','Briefing encerrado.','cancelled record cannot be edited');
select is((select count(*)::integer from public.commercial_briefing_revisions where briefing_id='cb210000-0000-4000-8000-000000000001'),4,'cancellation audited');
reset role;
select * from finish();
rollback;
