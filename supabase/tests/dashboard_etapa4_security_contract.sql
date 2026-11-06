-- Executar somente em banco de homologação com migrations aplicadas.
-- Estes testes NÃO são executados nem contra produção por este PR.
BEGIN;
SELECT plan(24);
SELECT has_table('public','dashboard_operational_rules','regras publicadas');
SELECT has_table('public','dashboard_operational_rule_revisions','revisões de regras');
SELECT has_table('public','dashboard_work_calendar_versions','versões de calendário');
SELECT has_table('public','dashboard_work_calendar_periods','turnos semanais');
SELECT has_table('public','dashboard_work_calendar_exceptions','feriados e exceções');
SELECT has_table('public','os_item_operation_dependencies','dependências entre operações');
SELECT has_table('public','dashboard_operation_dependency_audit','auditoria de vínculos');
SELECT has_table('public','dashboard_stage_intervals','evidência de intervalos');
SELECT has_table('public','dashboard_stage_pauses','evidência de pausas');
SELECT ok((SELECT bool_and(c.relrowsecurity) FROM pg_class c
  WHERE c.oid = ANY(ARRAY[
    'public.dashboard_operational_rules'::regclass,
    'public.dashboard_operational_rule_revisions'::regclass,
    'public.dashboard_work_calendar_versions'::regclass,
    'public.dashboard_work_calendar_periods'::regclass,
    'public.dashboard_work_calendar_exceptions'::regclass,
    'public.os_item_operation_dependencies'::regclass,
    'public.dashboard_operation_dependency_audit'::regclass,
    'public.dashboard_stage_intervals'::regclass,
    'public.dashboard_stage_pauses'::regclass
  ])),'RLS ativo nas 9 novas tabelas');
SELECT ok(NOT has_table_privilege('anon','public.dashboard_operational_rules','SELECT'),
  'anon não lê regras');
SELECT ok(NOT has_table_privilege('authenticated','public.dashboard_operational_rules','INSERT'),
  'usuário não insere regras diretamente');
SELECT ok(NOT has_table_privilege('authenticated','public.os_item_operation_dependencies','UPDATE'),
  'usuário não altera vínculo diretamente');
SELECT ok(NOT has_table_privilege('authenticated','public.dashboard_operation_dependency_audit','DELETE'),
  'usuário não apaga auditoria');
SELECT ok(has_table_privilege('authenticated','public.os_item_operation_dependencies','SELECT'),
  'leitura é permitida para RLS avaliar');
SELECT has_function('public','dashboard_publish_rule',
  ARRAY['text','text','text','text','integer','uuid','integer','text'],'RPC regras existe');
SELECT has_function('public','dashboard_publish_calendar',
  ARRAY['text','date','date','jsonb','jsonb','integer','text'],'RPC calendário existe');
SELECT has_function('public','dashboard_link_operations',
  ARRAY['uuid','uuid','uuid','text'],'RPC de criar vínculo existe');
SELECT has_function('public','dashboard_unlink_operations',
  ARRAY['uuid','text'],'RPC de remover vínculo existe');
SELECT ok(NOT has_function_privilege('anon',
  'public.dashboard_publish_rule(text,text,text,text,integer,uuid,integer,text)','EXECUTE'),
  'anon não publica regra');
SELECT ok(has_function_privilege('authenticated',
  'public.dashboard_publish_rule(text,text,text,text,integer,uuid,integer,text)','EXECUTE'),
  'gestor pode chamar RPC de regras (com checagem interna)');
SELECT ok(NOT has_function_privilege('authenticated','public.dashboard_assert_manager()','EXECUTE'),
  'assert de privilégio inacessível diretamente');
SELECT ok((SELECT count(*) FROM pg_policies
  WHERE schemaname='public' AND tablename IN ('dashboard_operational_rules',
    'os_item_operation_dependencies','dashboard_operation_dependency_audit',
    'dashboard_operational_rule_revisions') AND cmd IN ('INSERT','UPDATE','DELETE'))=0,
  'nenhuma política permite escrita direta');
SELECT ok((SELECT count(*) FROM pg_trigger t
    WHERE t.tgrelid='public.os_order_item_operations'::regclass AND
      t.tgname='dashboard_dependency_cleanup_operation' AND NOT t.tgisinternal)=1,
  'exclusão/alteração operacional possui trigger de limpeza');
SELECT * FROM finish();
ROLLBACK;
