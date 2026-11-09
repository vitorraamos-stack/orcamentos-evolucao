import { supabase } from "@/lib/supabase";
import { listDashboardPreparationSources } from "./dashboardPreparationRepository";
import { loadPublishedThresholds } from "./dashboardThresholdsRepository";
import { loadSectorCalendarRevisions } from "./dashboardSectorCalendarRepository";
import type {
  AdvancedSources, OperationDependency, RelationSource, RuleSource, RuleSpec,
  StageAssignee, StageDeadline, StageInterval, StagePause, TimingRule,
  WorkCalendarVersion, WorkCalendarPeriod, WorkCalendarException,
} from "./dashboardAdvanced";

const PAGE_SIZE = 500;
const BATCH = 80;

type IdRecord = { id: string };

/** Exact-count RLS pages. Never treat an incomplete/denied query as empty. */
async function readByIds<T extends IdRecord>(
  table: "os_order_assignees" | "os_order_deadlines" | "os_item_operation_dependencies" |
    "dashboard_stage_intervals" | "dashboard_stage_pauses" |
    "dashboard_work_calendar_versions" | "dashboard_work_calendar_periods" |
    "dashboard_work_calendar_exceptions",
  fields: string, field: "order_id" | "stage_interval_id" | "calendar_version_id" | "id",
  ids: readonly string[], signal?: AbortSignal
): Promise<T[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const result: T[] = [];
  for (let index = 0; index < unique.length; index += BATCH) {
    const ids = unique.slice(index, index + BATCH);
    for (let attempt = 0; attempt < 2; attempt++) {
      const batch: T[] = [];
      let expected: number | null = null;
      try {
        for (let offset = 0; ; offset += PAGE_SIZE) {
          let query = supabase.from(table)
            .select(fields, { count: "exact" }).in(field, ids)
            .order("id", { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
          if (signal) query = query.abortSignal(signal);
          const { data, count, error } = await query;
          if (error) throw error;
          if (count === null || !Number.isSafeInteger(count) || count < 0)
            throw new Error("Contagem dos registros avançados não confirmada");
          if (expected === null) expected = count;
          if (count !== expected) throw new Error("Os registros avançados mudaram durante a paginação");
          const rows = (data ?? []) as unknown as T[];
          batch.push(...rows);
          if (batch.length >= expected) break;
          if (rows.length !== PAGE_SIZE)
            throw new Error("Consulta avançada interrompida antes do fim");
        }
        if (batch.length !== expected || new Set(batch.map(row => row.id)).size !== expected)
          throw new Error("Os registros avançados mudaram durante a leitura");
        result.push(...batch);
        break;
      } catch (e) {
        if (signal?.aborted || attempt === 1 || !(e instanceof Error) ||
            !/mudaram|interrompida/.test(e.message)) throw e;
      }
    }
  }
  return result;
}

/** Recognize ONLY a schema that does not exist yet, not permission/network errors. */
export function isMissingSchema(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  return code === "42P01" || code === "PGRST205";
}

function validRule(value: unknown): value is RuleSpec {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const validScope = ["ART", "APPROVAL", "PRODUCTION", "FINISHING", "INSTALLATION", "LOGISTICS"].includes(String(row.scope));
  const validRequirement = (v: unknown) => ["required", "optional", "conditional"].includes(String(v));
  return validScope && validRequirement(row.owner) && validRequirement(row.deadline) &&
    (row.conditionLogisticType === null || row.conditionLogisticType === "instalacao" ||
      row.conditionLogisticType === "entrega" || row.conditionLogisticType === "retirada") &&
    (((row.owner === "conditional" || row.deadline === "conditional") &&
      row.conditionLogisticType !== null) ||
      ((row.owner !== "conditional" && row.deadline !== "conditional") &&
        row.conditionLogisticType === null)) &&
    (row.scope !== "APPROVAL" || row.owner === "optional") &&
    (row.scope !== "LOGISTICS" || (row.owner === "optional" && row.deadline === "optional")) &&
    (row.stalledLimitMinutes === null ||
      (Number.isSafeInteger(row.stalledLimitMinutes) && Number(row.stalledLimitMinutes) > 0)) &&
    typeof row.calendarVerified === "boolean";
}

/** Candidate table only. No default policy and no fake "optional" rules. */
export async function listDashboardOperationalRules(signal?: AbortSignal): Promise<RuleSource> {
  let query = supabase.from("dashboard_operational_rules")
    .select("id,scope,owner,deadline,condition_logistic_type,stalled_limit_minutes,calendar_verified");
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) {
    if (isMissingSchema(error)) return { state: "unavailable" };
    throw error;
  }
  const rules = (data ?? []).map(row => ({
    scope: row.scope,
    owner: row.owner,
    deadline: row.deadline,
    conditionLogisticType: row.condition_logistic_type,
    stalledLimitMinutes: row.stalled_limit_minutes,
    calendarVerified: row.calendar_verified,
  }));
  if (!rules.every(validRule)) return { state: "unavailable" };
  if (!rules.length) return { state: "unavailable" };
  if (new Set(rules.map(r => r.scope)).size !== rules.length) return { state: "unavailable" };
  return { state: "configured", rules };
}

/** Links must be physically registered; no dependency inferred from order. */
export async function listDashboardDependencies(
  orderIds: readonly string[], signal?: AbortSignal
): Promise<RelationSource> {
  if (!orderIds.length) return { state: "available", links: [] };
  try {
    const links = await readByIds<OperationDependency>(
      "os_item_operation_dependencies",
      "id,order_id,predecessor_operation_id,successor_operation_id",
      "order_id", orderIds, signal,
    );
    return { state: "available", links };
  } catch (error) {
    if (isMissingSchema(error)) return { state: "unavailable" };
    throw error;
  }
}

type TimingSourceBundle = {
  timingRules: TimingRule[];
  timingEvidenceAvailable: boolean;
  stageIntervals: StageInterval[];
  stagePauses: StagePause[];
  calendars: WorkCalendarVersion[];
  calendarPeriods: WorkCalendarPeriod[];
  calendarExceptions: WorkCalendarException[];
};

/** Temporal evidence is read-only and must be complete; missing schema is not an empty calendar. */
async function listDashboardTimingSources(
  orderIds: string[], signal?: AbortSignal
): Promise<TimingSourceBundle> {
  const empty: TimingSourceBundle = {
    timingRules: [], timingEvidenceAvailable: false, stageIntervals: [],
    stagePauses: [], calendars: [], calendarPeriods: [], calendarExceptions: [],
  };
  if (!orderIds.length) return { ...empty, timingEvidenceAvailable: true };

  try {
    let timingRuleQuery = supabase.from("dashboard_operational_rules")
      .select("id,scope,stalled_limit_minutes,calendar_version_id,calendar_verified,revision,updated_at");
    if (signal) timingRuleQuery = timingRuleQuery.abortSignal(signal);
    const [stageIntervals, rulesResult] = await Promise.all([
      readByIds<StageInterval>(
        "dashboard_stage_intervals",
        "id,order_id,scope,entered_at,left_at,calendar_version_id,rule_revision_id,evidence_state",
        "order_id", orderIds, signal,
      ),
      timingRuleQuery,
    ]);
    if (rulesResult.error) throw rulesResult.error;
    const timingRules = (rulesResult.data ?? []) as TimingRule[];
    const intervalIds = stageIntervals.map(row => row.id);
    const calendarIds = Array.from(new Set(stageIntervals
      .map(row => row.calendar_version_id).filter((id): id is string => Boolean(id))));

    const stagePauses = intervalIds.length
      ? await readByIds<StagePause>(
          "dashboard_stage_pauses",
          "id,stage_interval_id,operation_id,started_at,ended_at,reason,evidence_state",
          "stage_interval_id", intervalIds, signal,
        )
      : [];

    let calendars: WorkCalendarVersion[] = [];
    let calendarPeriods: WorkCalendarPeriod[] = [];
    let calendarExceptions: WorkCalendarException[] = [];
    if (calendarIds.length) {
      [calendars, calendarPeriods, calendarExceptions] = await Promise.all([
        readByIds<WorkCalendarVersion>(
          "dashboard_work_calendar_versions",
          "id,version,time_zone,effective_from,effective_until",
          "id", calendarIds, signal,
        ),
        readByIds<WorkCalendarPeriod>(
          "dashboard_work_calendar_periods",
          "id,calendar_version_id,weekday,starts_local,ends_local",
          "calendar_version_id", calendarIds, signal,
        ),
        readByIds<WorkCalendarException>(
          "dashboard_work_calendar_exceptions",
          "id,calendar_version_id,exception_date,working,starts_local,ends_local",
          "calendar_version_id", calendarIds, signal,
        ),
      ]);
    }

    return {
      timingRules, timingEvidenceAvailable: true, stageIntervals, stagePauses,
      calendars, calendarPeriods, calendarExceptions,
    };
  } catch (error) {
    if (isMissingSchema(error)) return empty;
    throw error;
  }
}

/** Read-only; runs only when the user requests advanced analysis. */
export async function listDashboardAdvancedSources(
  orderIds: string[], signal?: AbortSignal
): Promise<AdvancedSources> {
  const [preparation, assignees, deadlines, rules, dependencies, timing, thresholds, sectorCalendars] = await Promise.all([
    listDashboardPreparationSources(orderIds, signal),
    readByIds<StageAssignee>(
      "os_order_assignees", "id,order_id,user_id,scope", "order_id", orderIds, signal,
    ),
    readByIds<StageDeadline>(
      "os_order_deadlines", "id,order_id,scope,due_date,completed_at", "order_id", orderIds, signal,
    ),
    listDashboardOperationalRules(signal),
    listDashboardDependencies(orderIds, signal),
    listDashboardTimingSources(orderIds, signal),
    loadPublishedThresholds(),
    loadSectorCalendarRevisions(),
  ]);
  return {
    items: preparation.items, operations: preparation.operations,
    assignees, deadlines, rules, dependencies, events: [], thresholds, sectorCalendars,
    ...timing,
  };
}
