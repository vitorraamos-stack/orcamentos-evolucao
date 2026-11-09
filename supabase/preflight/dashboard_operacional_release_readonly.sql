-- EvoluSystem / Dashboard Operacional - pré-verificação READ ONLY.
-- Pode ser executado no Supabase existente. Não cria objetos, não inicia
-- transações de escrita e não realiza implantação.
-- Antes de publicar PR #556: conferir resultado, backup, CI e migrations.
WITH required_tables(name) AS (
  VALUES
    ('dashboard_work_calendar_versions'),
    ('dashboard_work_calendar_periods'),
    ('dashboard_work_calendar_exceptions'),
    ('dashboard_operational_rules'),
    ('dashboard_operational_rule_revisions'),
    ('dashboard_stage_intervals'),
    ('dashboard_stage_pauses'),
    ('profiles'),
    ('os_orders'),
    ('os_order_item_operations')
), pending_tables(name) AS (
  VALUES
    ('dashboard_operational_thresholds'),
    ('dashboard_operational_threshold_revisions'),
    ('dashboard_sector_calendar_revisions'),
    ('dashboard_calendar_succession_audit'),
    ('dashboard_calendar_retro_review_requests'),
    ('dashboard_calendar_retro_review_events'),
    ('dashboard_calendar_retro_approval_dossiers')
), required_functions(signature) AS (
  VALUES
    ('public.dashboard_assert_manager()'),
    ('public.dashboard_reject_audit_mutation()')
), missing_base AS (
  SELECT coalesce(jsonb_agg(name ORDER BY name),'[]'::jsonb) AS names
  FROM required_tables
  WHERE to_regclass('public.' || name) IS NULL
), existing_new AS (
  SELECT coalesce(jsonb_agg(name ORDER BY name),'[]'::jsonb) AS names
  FROM pending_tables
  WHERE to_regclass('public.' || name) IS NOT NULL
), missing_functions AS (
  SELECT coalesce(jsonb_agg(signature ORDER BY signature),'[]'::jsonb) AS names
  FROM required_functions
  WHERE to_regprocedure(signature) IS NULL
)
SELECT jsonb_build_object(
  'check','dashboard_operacional_release_readonly',
  'missing_base_tables',(SELECT names FROM missing_base),
  'new_tables_already_present',(SELECT names FROM existing_new),
  'missing_base_functions',(SELECT names FROM missing_functions),
  'base_prerequisites_present',
    (SELECT jsonb_array_length(names)=0 FROM missing_base) AND
    (SELECT jsonb_array_length(names)=0 FROM missing_functions),
  'new_schema_not_yet_deployed',
    (SELECT jsonb_array_length(names)=0 FROM existing_new),
  'schema_validated_in_postgres',false,
  'production_release_authorized',false,
  'next_step','Revisar snapshot/backup e executar migrations explicitamente antes do deploy'
) AS release_readiness;
