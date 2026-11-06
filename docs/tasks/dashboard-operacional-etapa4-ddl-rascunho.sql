-- EvoluSystem / Dashboard Etapa 4 — SQL ESTRUTURAL DE REFERÊNCIA
-- STATUS: RASCUNHO BLOQUEADO. NÃO É UMA MIGRATION. NÃO EXECUTAR.
-- Localização proposital: docs/tasks/, FORA de supabase/migrations/.
-- Faltam: funções de escrita/admin, validação transacional contra ciclos,
-- auditoria inviolável, proteção contra vínculos de operações soft-deleted,
-- cálculo temporal, implantação testada em banco isolado e aprovações.
--
-- TRAVA DE SEGURANÇA: qualquer tentativa de rodar o arquivo aborta.
DO $draft_must_not_execute$
BEGIN
  RAISE EXCEPTION 'DRAFT ONLY: não aplicar no Supabase. Requer aprovação independente e implementação segura dos RPCs.';
END;
$draft_must_not_execute$;

-- Daqui para baixo: MODELO DE DDL, para revisão por pares, NÃO validado por
-- execução no banco. Requer compatibilizar a engine de regras com 'retirada'
-- e com escopos sem fonte antes de qualquer execução homologada.
BEGIN;

-- 1) Regras VIGENTES: contrato de leitura do PR #555, sem valores iniciais.
CREATE TABLE public.dashboard_operational_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL UNIQUE CHECK (scope IN
    ('ART','APPROVAL','PRODUCTION','FINISHING','INSTALLATION','LOGISTICS')),
  owner text NOT NULL CHECK (owner IN ('required','optional','conditional')),
  deadline text NOT NULL CHECK (deadline IN ('required','optional','conditional')),
  condition_logistic_type text CHECK
    (condition_logistic_type IS NULL OR condition_logistic_type IN ('retirada','entrega','instalacao')),
  stalled_limit_minutes integer CHECK (stalled_limit_minutes IS NULL OR stalled_limit_minutes > 0),
  -- Escrito SOMENTE via RPC e apenas com calendário publicado/verificado.
  calendar_verified boolean NOT NULL DEFAULT false,
  calendar_version_id uuid,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  effective_from timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id),
  CONSTRAINT dashboard_rule_condition_check CHECK (
    ((owner='conditional' OR deadline='conditional') AND condition_logistic_type IS NOT NULL)
    OR ((owner<>'conditional' AND deadline<>'conditional') AND condition_logistic_type IS NULL)
  ),
  -- Campos que ainda não possuem origem persistida verificável.
  CONSTRAINT dashboard_rule_scope_supported CHECK (
    (scope <> 'APPROVAL' OR owner='optional')
    AND (scope <> 'LOGISTICS' OR (owner='optional' AND deadline='optional'))
  )
);

CREATE TABLE public.dashboard_operational_rule_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.dashboard_operational_rules(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  old_value jsonb,
  new_value jsonb NOT NULL,
  changed_by uuid NOT NULL REFERENCES public.profiles(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  UNIQUE (rule_id, revision)
);

-- 2) Calendário versionado e confirmado; não assumir horários/feriados.
CREATE TABLE public.dashboard_work_calendar_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE CHECK (version > 0),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 140),
  time_zone text NOT NULL DEFAULT 'America/Sao_Paulo',
  status text NOT NULL CHECK (status IN ('draft','published','retired')),
  effective_from date NOT NULL,
  effective_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  published_at timestamptz,
  published_by uuid REFERENCES public.profiles(id),
  CHECK (effective_until IS NULL OR effective_until >= effective_from),
  CHECK (status <> 'published' OR (published_at IS NOT NULL AND published_by IS NOT NULL))
);
ALTER TABLE public.dashboard_operational_rules
  ADD CONSTRAINT dashboard_rule_calendar_fk
  FOREIGN KEY (calendar_version_id) REFERENCES public.dashboard_work_calendar_versions(id);

CREATE TABLE public.dashboard_work_calendar_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_version_id uuid NOT NULL REFERENCES public.dashboard_work_calendar_versions(id) ON DELETE RESTRICT,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_local time NOT NULL,
  ends_local time NOT NULL,
  CHECK (ends_local > starts_local),
  UNIQUE (calendar_version_id,weekday,starts_local,ends_local)
);
CREATE INDEX dashboard_period_calendar_idx ON public.dashboard_work_calendar_periods(calendar_version_id,weekday);

CREATE TABLE public.dashboard_work_calendar_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_version_id uuid NOT NULL REFERENCES public.dashboard_work_calendar_versions(id) ON DELETE RESTRICT,
  exception_date date NOT NULL,
  working boolean NOT NULL,
  starts_local time,
  ends_local time,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  CHECK ((NOT working AND starts_local IS NULL AND ends_local IS NULL) OR
         (working AND starts_local IS NOT NULL AND ends_local IS NOT NULL AND ends_local > starts_local))
);
CREATE INDEX dashboard_exception_calendar_date_idx
  ON public.dashboard_work_calendar_exceptions(calendar_version_id,exception_date);

-- 3) Vínculos explícitos entre operações da mesma OS.
-- ATENÇÃO: FKs sozinhas NÃO garantem que operações pertençam a mesma OS,
-- nem impedem ciclo nem vínculo com item/operação soft-deleted.
-- Sem RPC + trava por OS + validação recursiva, ESTE DDL NÃO É PUBLICÁVEL.
CREATE TABLE public.os_item_operation_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.os_orders(id) ON DELETE CASCADE,
  predecessor_operation_id uuid NOT NULL REFERENCES public.os_order_item_operations(id) ON DELETE RESTRICT,
  successor_operation_id uuid NOT NULL REFERENCES public.os_order_item_operations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  CONSTRAINT dashboard_dependency_not_self CHECK (predecessor_operation_id <> successor_operation_id),
  UNIQUE (order_id,predecessor_operation_id,successor_operation_id)
);
CREATE INDEX dashboard_dependency_predecessor_idx
  ON public.os_item_operation_dependencies(order_id,predecessor_operation_id);
CREATE INDEX dashboard_dependency_successor_idx
  ON public.os_item_operation_dependencies(order_id,successor_operation_id);

CREATE TABLE public.dashboard_operation_dependency_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dependency_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.os_orders(id) ON DELETE RESTRICT,
  predecessor_operation_id uuid NOT NULL,
  successor_operation_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('CREATED','REMOVED')),
  changed_by uuid NOT NULL REFERENCES public.profiles(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000)
);
CREATE INDEX dashboard_dep_audit_order_idx
  ON public.dashboard_operation_dependency_audit(order_id,changed_at DESC);

-- 4) Evidência de tempo por etapa e pausas. Apenas eventos novos comprovados;
-- não preencher automaticamente com updated_at ou histórico incompleto.
CREATE TABLE public.dashboard_stage_intervals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.os_orders(id) ON DELETE RESTRICT,
  scope text NOT NULL CHECK (scope IN
    ('ART','APPROVAL','PRODUCTION','FINISHING','INSTALLATION','LOGISTICS')),
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
CREATE INDEX dashboard_stage_interval_order_idx
  ON public.dashboard_stage_intervals(order_id,scope,entered_at DESC);

CREATE TABLE public.dashboard_stage_pauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_interval_id uuid NOT NULL REFERENCES public.dashboard_stage_intervals(id) ON DELETE RESTRICT,
  operation_id uuid REFERENCES public.os_order_item_operations(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  evidence_state text NOT NULL DEFAULT 'unverified' CHECK (evidence_state IN ('unverified','verified')),
  recorded_by uuid NOT NULL REFERENCES public.profiles(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at > started_at)
);
CREATE INDEX dashboard_stage_pause_interval_idx
  ON public.dashboard_stage_pauses(stage_interval_id,started_at);

-- 5) Acesso fechado por padrão. RLS em TODOS os objetos.
ALTER TABLE public.dashboard_operational_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_operational_rule_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_work_calendar_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_work_calendar_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_work_calendar_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_item_operation_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_operation_dependency_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_stage_intervals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_stage_pauses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.dashboard_operational_rules,
  public.dashboard_operational_rule_revisions,
  public.dashboard_work_calendar_versions,
  public.dashboard_work_calendar_periods,
  public.dashboard_work_calendar_exceptions,
  public.os_item_operation_dependencies,
  public.dashboard_operation_dependency_audit,
  public.dashboard_stage_intervals,
  public.dashboard_stage_pauses
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.dashboard_operational_rules,
  public.dashboard_work_calendar_versions,
  public.dashboard_work_calendar_periods,
  public.dashboard_work_calendar_exceptions,
  public.os_item_operation_dependencies,
  public.dashboard_stage_intervals,
  public.dashboard_stage_pauses
TO authenticated;
GRANT SELECT ON TABLE
  public.dashboard_operational_rule_revisions,
  public.dashboard_operation_dependency_audit
TO authenticated;

CREATE POLICY dashboard_operational_rules_read
  ON public.dashboard_operational_rules FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(),'hub_os'));
CREATE POLICY dashboard_operational_rule_revisions_read
  ON public.dashboard_operational_rule_revisions FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(),'hub_os') AND public.is_manager(auth.uid()));
CREATE POLICY dashboard_calendar_versions_read
  ON public.dashboard_work_calendar_versions FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(),'hub_os') AND
     (status='published' OR public.is_manager(auth.uid())));
CREATE POLICY dashboard_calendar_periods_read
  ON public.dashboard_work_calendar_periods FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dashboard_work_calendar_versions v
    WHERE v.id=calendar_version_id AND public.has_module_access(auth.uid(),'hub_os')));
CREATE POLICY dashboard_calendar_exceptions_read
  ON public.dashboard_work_calendar_exceptions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dashboard_work_calendar_versions v
    WHERE v.id=calendar_version_id AND public.has_module_access(auth.uid(),'hub_os')));
CREATE POLICY dashboard_dependencies_read
  ON public.os_item_operation_dependencies FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(),'hub_os'));
CREATE POLICY dashboard_dependency_audit_read
  ON public.dashboard_operation_dependency_audit FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(),'hub_os') AND public.is_manager(auth.uid()));
CREATE POLICY dashboard_stage_intervals_read
  ON public.dashboard_stage_intervals FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(),'hub_os'));
CREATE POLICY dashboard_stage_pauses_read
  ON public.dashboard_stage_pauses FOR SELECT TO authenticated
  USING (public.has_module_access(auth.uid(),'hub_os'));

-- 6) FALTAM (bloqueadores obrigatórios de release, não implementar aqui):
-- - RPC publish_rule com role-check, prévia de impacto e expected revision.
-- - RPC publish_calendar com validação de fuso, intervalos sobrepostos e vigência.
-- - RPC create/remove_dependency com lock OS FOR UPDATE, mesmo order_id,
--   atividades/itens ativos, CTE anti-ciclo, concorrência e auditoria atômica.
-- - Integração da exclusão lógica de item/operação à remoção auditada dos links.
-- - RPC append/close_stage_interval/pause com proteção temporal.
-- - Proteção de UPDATE/DELETE nos logs de auditoria, mesmo por RPC.
-- - Políticas de acesso de calendário não publicado e testes usando roles reais.
-- - Testes de integração e avaliação de compatibilidade do código do PR #555.
-- - Aprovação de ambiente de homologação e de migration de produção.
ROLLBACK;
