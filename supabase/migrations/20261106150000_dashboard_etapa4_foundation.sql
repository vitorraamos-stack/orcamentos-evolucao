-- Dashboard Etapa 4 — estrutura aditiva, RLS e contratos. Não cria dados operacionais.
-- Nenhuma regra, jornada, feriado, pausa ou dependência é inserida automaticamente.
-- A API pública tem SELECT mínimo; todas as gravações passam por RPCs gerenciais.
CREATE TABLE public.dashboard_work_calendar_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE CHECK (version > 0),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 140),
  time_zone text NOT NULL DEFAULT 'America/Sao_Paulo'
    CHECK (time_zone = 'America/Sao_Paulo'),
  effective_from date NOT NULL,
  effective_until date,
  status text NOT NULL DEFAULT 'published' CHECK (status = 'published'),
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid NOT NULL REFERENCES public.profiles(id),
  publication_reason text NOT NULL CHECK (length(btrim(publication_reason)) BETWEEN 3 AND 1000),
  CHECK (effective_until IS NULL OR effective_until >= effective_from)
);
CREATE TABLE public.dashboard_work_calendar_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_version_id uuid NOT NULL REFERENCES public.dashboard_work_calendar_versions(id) ON DELETE RESTRICT,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_local time NOT NULL,
  ends_local time NOT NULL,
  CHECK (ends_local > starts_local),
  UNIQUE(calendar_version_id,weekday,starts_local,ends_local)
);
CREATE INDEX dashboard_calendar_period_lookup ON public.dashboard_work_calendar_periods(calendar_version_id,weekday);
CREATE TABLE public.dashboard_work_calendar_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_version_id uuid NOT NULL REFERENCES public.dashboard_work_calendar_versions(id) ON DELETE RESTRICT,
  exception_date date NOT NULL,
  working boolean NOT NULL,
  starts_local time,
  ends_local time,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  UNIQUE(calendar_version_id,exception_date),
  CHECK ((NOT working AND starts_local IS NULL AND ends_local IS NULL) OR
         (working AND starts_local IS NOT NULL AND ends_local IS NOT NULL AND ends_local > starts_local))
);
CREATE INDEX dashboard_calendar_exception_lookup ON public.dashboard_work_calendar_exceptions(calendar_version_id,exception_date);

-- Uma linha por escopo PUBLICADO. Publicações serializadas e revisadas pela RPC.
CREATE TABLE public.dashboard_operational_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL UNIQUE CHECK (scope IN ('ART','APPROVAL','PRODUCTION','FINISHING','INSTALLATION','LOGISTICS')),
  owner text NOT NULL CHECK (owner IN ('required','optional','conditional')),
  deadline text NOT NULL CHECK (deadline IN ('required','optional','conditional')),
  condition_logistic_type text CHECK (condition_logistic_type IS NULL OR condition_logistic_type IN ('retirada','entrega','instalacao')),
  stalled_limit_minutes integer CHECK (stalled_limit_minutes IS NULL OR stalled_limit_minutes > 0),
  calendar_version_id uuid REFERENCES public.dashboard_work_calendar_versions(id) ON DELETE RESTRICT,
  calendar_verified boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  effective_from timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES public.profiles(id),
  CONSTRAINT dashboard_rule_condition_consistent CHECK (
    ((owner='conditional' OR deadline='conditional') AND condition_logistic_type IS NOT NULL) OR
    ((owner<>'conditional' AND deadline<>'conditional') AND condition_logistic_type IS NULL)
  ),
  CONSTRAINT dashboard_rule_supported_scopes CHECK (
    (scope <> 'APPROVAL' OR owner='optional') AND
    (scope <> 'LOGISTICS' OR (owner='optional' AND deadline='optional'))
  ),
  CONSTRAINT dashboard_rule_calendar_limit CHECK (
    stalled_limit_minutes IS NULL OR calendar_version_id IS NOT NULL
  )
);
CREATE TABLE public.dashboard_operational_rule_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.dashboard_operational_rules(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  previous_rule jsonb,
  published_rule jsonb NOT NULL,
  changed_by uuid NOT NULL REFERENCES public.profiles(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  UNIQUE(rule_id,revision)
);

-- Vínculos explícitos, direcionais, sem duplicidade. Exclusão física da OS
-- continua possível (ON DELETE CASCADE); auditoria deve sobreviver à exclusão.
CREATE TABLE public.os_item_operation_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.os_orders(id) ON DELETE CASCADE,
  predecessor_operation_id uuid NOT NULL REFERENCES public.os_order_item_operations(id) ON DELETE CASCADE,
  successor_operation_id uuid NOT NULL REFERENCES public.os_order_item_operations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  CHECK (predecessor_operation_id <> successor_operation_id),
  UNIQUE(order_id,predecessor_operation_id,successor_operation_id)
);
CREATE INDEX dashboard_dependency_predecessor_idx ON public.os_item_operation_dependencies(order_id,predecessor_operation_id);
CREATE INDEX dashboard_dependency_successor_idx ON public.os_item_operation_dependencies(order_id,successor_operation_id);
CREATE TABLE public.dashboard_operation_dependency_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dependency_id uuid NOT NULL,
  order_id uuid NOT NULL,
  predecessor_operation_id uuid NOT NULL,
  successor_operation_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('CREATED','REMOVED')),
  changed_by uuid REFERENCES public.profiles(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000)
);
CREATE INDEX dashboard_dependency_audit_order_idx ON public.dashboard_operation_dependency_audit(order_id,changed_at DESC);

-- Evidências futuras. Não retroprojetar timestamps resumidos existentes.
CREATE TABLE public.dashboard_stage_intervals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.os_orders(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('ART','APPROVAL','PRODUCTION','FINISHING','INSTALLATION','LOGISTICS')),
  entered_at timestamptz NOT NULL,
  left_at timestamptz,
  calendar_version_id uuid REFERENCES public.dashboard_work_calendar_versions(id) ON DELETE RESTRICT,
  rule_revision_id uuid REFERENCES public.dashboard_operational_rule_revisions(id) ON DELETE RESTRICT,
  evidence_state text NOT NULL DEFAULT 'unverified' CHECK (evidence_state IN ('unverified','verified')),
  source_event_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES public.profiles(id),
  CHECK (left_at IS NULL OR left_at >= entered_at)
);
CREATE INDEX dashboard_stage_interval_lookup ON public.dashboard_stage_intervals(order_id,scope,entered_at DESC);
CREATE TABLE public.dashboard_stage_pauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_interval_id uuid NOT NULL REFERENCES public.dashboard_stage_intervals(id) ON DELETE CASCADE,
  operation_id uuid REFERENCES public.os_order_item_operations(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  evidence_state text NOT NULL DEFAULT 'unverified' CHECK (evidence_state IN ('unverified','verified')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES public.profiles(id),
  CHECK (ended_at IS NULL OR ended_at > started_at)
);
CREATE INDEX dashboard_stage_pause_lookup ON public.dashboard_stage_pauses(stage_interval_id,started_at);

-- RLS + grants explicitamente fechados desde a mesma migration.
ALTER TABLE public.dashboard_work_calendar_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_work_calendar_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_work_calendar_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_operational_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_operational_rule_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_item_operation_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_operation_dependency_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_stage_intervals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_stage_pauses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE
 public.dashboard_work_calendar_versions, public.dashboard_work_calendar_periods,
 public.dashboard_work_calendar_exceptions, public.dashboard_operational_rules,
 public.dashboard_operational_rule_revisions, public.os_item_operation_dependencies,
 public.dashboard_operation_dependency_audit, public.dashboard_stage_intervals,
 public.dashboard_stage_pauses
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE
 public.dashboard_work_calendar_versions, public.dashboard_work_calendar_periods,
 public.dashboard_work_calendar_exceptions, public.dashboard_operational_rules,
 public.dashboard_operational_rule_revisions, public.os_item_operation_dependencies,
 public.dashboard_operation_dependency_audit, public.dashboard_stage_intervals,
 public.dashboard_stage_pauses TO authenticated;

CREATE POLICY dashboard_calendars_read ON public.dashboard_work_calendar_versions
 FOR SELECT TO authenticated USING (public.has_module_access(auth.uid(),'hub_os'));
CREATE POLICY dashboard_calendar_periods_read ON public.dashboard_work_calendar_periods
 FOR SELECT TO authenticated USING (public.has_module_access(auth.uid(),'hub_os'));
CREATE POLICY dashboard_calendar_exceptions_read ON public.dashboard_work_calendar_exceptions
 FOR SELECT TO authenticated USING (public.has_module_access(auth.uid(),'hub_os'));
CREATE POLICY dashboard_rules_read ON public.dashboard_operational_rules
 FOR SELECT TO authenticated USING (public.has_module_access(auth.uid(),'hub_os'));
CREATE POLICY dashboard_rule_revisions_read ON public.dashboard_operational_rule_revisions
 FOR SELECT TO authenticated USING (public.has_module_access(auth.uid(),'hub_os') AND public.is_manager(auth.uid()));
CREATE POLICY dashboard_dependencies_read ON public.os_item_operation_dependencies
 FOR SELECT TO authenticated USING (public.has_module_access(auth.uid(),'hub_os'));
CREATE POLICY dashboard_dependency_audit_read ON public.dashboard_operation_dependency_audit
 FOR SELECT TO authenticated USING (public.has_module_access(auth.uid(),'hub_os') AND public.is_manager(auth.uid()));
CREATE POLICY dashboard_stage_intervals_read ON public.dashboard_stage_intervals
 FOR SELECT TO authenticated USING (public.has_module_access(auth.uid(),'hub_os'));
CREATE POLICY dashboard_stage_pauses_read ON public.dashboard_stage_pauses
 FOR SELECT TO authenticated USING (public.has_module_access(auth.uid(),'hub_os'));

-- Histórico publicado não pode ser reescrito por UPDATE/DELETE.
CREATE FUNCTION public.dashboard_reject_audit_mutation() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'Histórico ou calendário publicado imutável' USING ERRCODE='42501';
END $$;
CREATE TRIGGER dashboard_rules_audit_immutable
 BEFORE UPDATE OR DELETE ON public.dashboard_operational_rule_revisions
 FOR EACH ROW EXECUTE FUNCTION public.dashboard_reject_audit_mutation();
CREATE TRIGGER dashboard_dependency_audit_immutable
 BEFORE UPDATE OR DELETE ON public.dashboard_operation_dependency_audit
 FOR EACH ROW EXECUTE FUNCTION public.dashboard_reject_audit_mutation();
-- A publicação é atômica e cria uma nova versão: nenhuma versão publicada,
-- período ou exceção anteriores podem ser reescritos.
CREATE TRIGGER dashboard_calendar_version_immutable
 BEFORE UPDATE OR DELETE ON public.dashboard_work_calendar_versions
 FOR EACH ROW EXECUTE FUNCTION public.dashboard_reject_audit_mutation();
CREATE TRIGGER dashboard_calendar_period_immutable
 BEFORE UPDATE OR DELETE ON public.dashboard_work_calendar_periods
 FOR EACH ROW EXECUTE FUNCTION public.dashboard_reject_audit_mutation();
CREATE TRIGGER dashboard_calendar_exception_immutable
 BEFORE UPDATE OR DELETE ON public.dashboard_work_calendar_exceptions
 FOR EACH ROW EXECUTE FUNCTION public.dashboard_reject_audit_mutation();
REVOKE ALL ON FUNCTION public.dashboard_reject_audit_mutation() FROM PUBLIC, anon, authenticated;
