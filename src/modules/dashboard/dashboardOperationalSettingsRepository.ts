import { supabase } from "@/lib/supabase";
import type { OperationalScope, Requirement } from "./dashboardAdvanced";

export type OperationalRuleRecord = {
  id: string;
  scope: OperationalScope;
  owner: Requirement;
  deadline: Requirement;
  condition_logistic_type: "instalacao" | "entrega" | "retirada" | null;
  stalled_limit_minutes: number | null;
  calendar_version_id: string | null;
  calendar_verified: boolean;
  revision: number;
  effective_from: string;
  updated_at: string;
  updated_by: string;
};

export type CalendarVersionRecord = {
  id: string;
  version: number;
  name: string;
  time_zone: string;
  effective_from: string;
  effective_until: string | null;
  status: "published";
  published_at: string;
  published_by: string;
  publication_reason: string;
};

export type CalendarPeriodRecord = {
  id: string;
  calendar_version_id: string;
  weekday: number;
  starts_local: string;
  ends_local: string;
};

export type CalendarExceptionRecord = {
  id: string;
  calendar_version_id: string;
  exception_date: string;
  working: boolean;
  starts_local: string | null;
  ends_local: string | null;
  reason: string;
};

export type RuleRevisionRecord = {
  id: string;
  rule_id: string;
  revision: number;
  published_rule: Record<string, unknown>;
  changed_by: string;
  changed_at: string;
  reason: string;
};

export type RuleImpactPreview = {
  scope: OperationalScope;
  os_consultadas: number;
  sem_responsavel: number;
  sem_prazo: number;
  duracao_verificada: false;
  observacao: string;
};

export type DashboardOperationalSettings = {
  rules: OperationalRuleRecord[];
  calendars: CalendarVersionRecord[];
  periods: CalendarPeriodRecord[];
  exceptions: CalendarExceptionRecord[];
  revisions: RuleRevisionRecord[];
};

function fail(error: { message?: string } | null, fallback: string): never | void {
  if (error) throw new Error(error.message || fallback);
}

/** Read-only access through the RLS policies installed for the operational module. */
export async function loadDashboardOperationalSettings(): Promise<DashboardOperationalSettings> {
  const [rulesResult, calendarsResult, revisionsResult] = await Promise.all([
    supabase.from("dashboard_operational_rules")
      .select("id,scope,owner,deadline,condition_logistic_type,stalled_limit_minutes,calendar_version_id,calendar_verified,revision,effective_from,updated_at,updated_by")
      .order("scope", { ascending: true }),
    supabase.from("dashboard_work_calendar_versions")
      .select("id,version,name,time_zone,effective_from,effective_until,status,published_at,published_by,publication_reason")
      .order("version", { ascending: false }),
    supabase.from("dashboard_operational_rule_revisions")
      .select("id,rule_id,revision,published_rule,changed_by,changed_at,reason")
      .order("changed_at", { ascending: false })
      .limit(100),
  ]);

  fail(rulesResult.error, "Não foi possível consultar as regras operacionais.");
  fail(calendarsResult.error, "Não foi possível consultar os calendários.");
  fail(revisionsResult.error, "Não foi possível consultar o histórico de regras.");

  const calendars = (calendarsResult.data ?? []) as CalendarVersionRecord[];
  const calendarIds = calendars.map(row => row.id);
  let periods: CalendarPeriodRecord[] = [];
  let exceptions: CalendarExceptionRecord[] = [];

  if (calendarIds.length) {
    const [periodResult, exceptionResult] = await Promise.all([
      supabase.from("dashboard_work_calendar_periods")
        .select("id,calendar_version_id,weekday,starts_local,ends_local")
        .in("calendar_version_id", calendarIds)
        .order("weekday", { ascending: true })
        .order("starts_local", { ascending: true }),
      supabase.from("dashboard_work_calendar_exceptions")
        .select("id,calendar_version_id,exception_date,working,starts_local,ends_local,reason")
        .in("calendar_version_id", calendarIds)
        .order("exception_date", { ascending: true }),
    ]);
    fail(periodResult.error, "Não foi possível consultar os horários dos calendários.");
    fail(exceptionResult.error, "Não foi possível consultar as exceções dos calendários.");
    periods = (periodResult.data ?? []) as CalendarPeriodRecord[];
    exceptions = (exceptionResult.data ?? []) as CalendarExceptionRecord[];
  }

  return {
    rules: (rulesResult.data ?? []) as OperationalRuleRecord[],
    calendars,
    periods,
    exceptions,
    revisions: (revisionsResult.data ?? []) as RuleRevisionRecord[],
  };
}

export async function previewDashboardRuleImpact(input: {
  scope: OperationalScope;
  owner: Requirement;
  deadline: Requirement;
  conditionLogisticType: "instalacao" | "entrega" | "retirada" | null;
  stalledLimitMinutes: number | null;
  calendarVersionId: string | null;
}): Promise<RuleImpactPreview> {
  const { data, error } = await supabase.rpc("dashboard_preview_rule_impact", {
    p_scope: input.scope,
    p_owner: input.owner,
    p_deadline: input.deadline,
    p_condition_logistic_type: input.conditionLogisticType,
    p_stalled_limit_minutes: input.stalledLimitMinutes,
    p_calendar_version_id: input.calendarVersionId,
  });
  if (error) throw new Error(error.message || "Não foi possível calcular a prévia de impacto.");
  if (!data || typeof data !== "object") throw new Error("A prévia retornou uma resposta inválida.");
  return data as RuleImpactPreview;
}

export async function publishDashboardRule(input: {
  scope: OperationalScope;
  owner: Requirement;
  deadline: Requirement;
  conditionLogisticType: "instalacao" | "entrega" | "retirada" | null;
  stalledLimitMinutes: number | null;
  calendarVersionId: string | null;
  expectedRevision: number;
  reason: string;
}): Promise<OperationalRuleRecord> {
  const { data, error } = await supabase.rpc("dashboard_publish_rule", {
    p_scope: input.scope,
    p_owner: input.owner,
    p_deadline: input.deadline,
    p_condition_logistic_type: input.conditionLogisticType,
    p_stalled_limit_minutes: input.stalledLimitMinutes,
    p_calendar_version_id: input.calendarVersionId,
    p_expected_revision: input.expectedRevision,
    p_reason: input.reason,
  });
  if (error) throw new Error(error.message || "Não foi possível publicar a regra.");
  if (!data || typeof data !== "object") throw new Error("A publicação da regra não retornou confirmação.");
  return data as OperationalRuleRecord;
}

export async function publishDashboardCalendar(input: {
  name: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  periods: Array<{ weekday: number; start: string; end: string }>;
  exceptions: Array<{ date: string; working: boolean; start: string | null; end: string | null; reason: string }>;
  expectedLastVersion: number;
  reason: string;
}): Promise<CalendarVersionRecord> {
  const { data, error } = await supabase.rpc("dashboard_publish_calendar", {
    p_name: input.name,
    p_effective_from: input.effectiveFrom,
    p_effective_until: input.effectiveUntil,
    p_periods: input.periods,
    p_exceptions: input.exceptions,
    p_expected_last_version: input.expectedLastVersion,
    p_reason: input.reason,
  });
  if (error) throw new Error(error.message || "Não foi possível publicar o calendário.");
  if (!data || typeof data !== "object") throw new Error("A publicação do calendário não retornou confirmação.");
  return data as CalendarVersionRecord;
}
