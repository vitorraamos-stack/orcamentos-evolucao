import type { DashboardOrder } from "./dashboardModel";
import type { PreparationItem, PreparationOperation } from "./dashboardPreparation";
import { assessOperationalThreshold } from "./dashboardOperationalPolicy";
import { selectGlobalCalendarForDate } from "./dashboardCalendarTimeline";
import {
  resolveSectorCalendarDay, type SectorCalendarRevision,
} from "./dashboardSectorCalendar";

/**
 * Dashboard stage 4: read-only analysis from persisted sources. Rules,
 * calendars, dependencies and stage history are recognized only when present.
 * Unavailable != empty / optional / zero.
 */
export type OperationalScope = "ART" | "APPROVAL" | "PRODUCTION" | "FINISHING" | "INSTALLATION" | "LOGISTICS";
export type Requirement = "required" | "optional" | "conditional";
export type RuleSpec = {
  scope: OperationalScope;
  owner: Requirement;
  deadline: Requirement;
  conditionLogisticType: "instalacao" | "entrega" | "retirada" | null;
  stalledLimitMinutes: number | null;
  calendarVerified: boolean;
};
export type RuleSource = { state: "unavailable" } | { state: "configured"; rules: RuleSpec[] };
export type RelationSource =
  | { state: "unavailable" }
  | { state: "available"; links: OperationDependency[] };
export type OperationDependency = {
  id: string;
  order_id: string;
  predecessor_operation_id: string;
  successor_operation_id: string;
};
export type StageAssignee = { id: string; order_id: string; user_id: string; scope: string };
export type StageDeadline = { id: string; order_id: string; scope: string; due_date: string; completed_at: string | null };
export type OperationAudit = {
  id: string; os_id: string; type: string; created_at: string;
  payload: Record<string, unknown> | null;
};

export type StageInterval = {
  id: string;
  order_id: string;
  scope: OperationalScope;
  entered_at: string;
  left_at: string | null;
  calendar_version_id: string | null;
  rule_revision_id: string | null;
  evidence_state: "verified" | "unverified";
};
export type StagePause = {
  id: string;
  stage_interval_id: string;
  operation_id: string | null;
  started_at: string;
  ended_at: string | null;
  reason: string;
  evidence_state: "verified" | "unverified";
};
export type TimingRule = {
  id: string;
  scope: OperationalScope;
  stalled_limit_minutes: number | null;
  calendar_version_id: string | null;
  calendar_verified: boolean;
  revision: number;
  updated_at: string;
};
export type WorkCalendarVersion = {
  id: string;
  version: number;
  time_zone: string;
  effective_from: string;
  effective_until: string | null;
};
export type WorkCalendarPeriod = {
  id: string;
  calendar_version_id: string;
  weekday: number;
  starts_local: string;
  ends_local: string;
};
export type WorkCalendarException = {
  id: string;
  calendar_version_id: string;
  exception_date: string;
  working: boolean;
  starts_local: string | null;
  ends_local: string | null;
};

export type PublishedThreshold = {
  scope: OperationalScope;
  attention_limit_minutes: number;
  critical_limit_minutes: number;
  calendar_version_id: string;
  revision: number;
  effective_from: string;
  updated_at: string;
};
export type ThresholdSource =
  | { state: "unavailable"; rows: [] }
  | { state: "available"; rows: PublishedThreshold[] };

export type AdvancedSources = {
  /** Undefined only in existing tests/legacy snapshots: treat as unavailable, never as zero. */
  thresholds?: ThresholdSource;
  sectorCalendars?: { state: "available"; revisions: SectorCalendarRevision[] } |
    { state: "unavailable"; revisions: [] };
  items: PreparationItem[];
  operations: PreparationOperation[];
  assignees: StageAssignee[];
  deadlines: StageDeadline[];
  rules: RuleSource;
  dependencies: RelationSource;
  events: OperationAudit[];
  timingRules: TimingRule[];
  timingEvidenceAvailable: boolean;
  stageIntervals: StageInterval[];
  stagePauses: StagePause[];
  calendars: WorkCalendarVersion[];
  calendarPeriods: WorkCalendarPeriod[];
  calendarExceptions: WorkCalendarException[];
};

export type DependencyRow = {
  operationId: string;
  workCenter: string;
  status: PreparationOperation["status"];
  predecessorIds: string[];
  waitingOn: string[];
  blockingPredecessors: string[];
};
export type DependencyAssessment = {
  state: "unavailable" | "available" | "insufficient";
  rows: DependencyRow[];
  independentIds: string[];
  linkCount: number;
  waitingCount: number;
  confirmedBlocks: number;
  problems: string[];
};

export type AdvancedOrderAssessment = {
  order: DashboardOrder;
  scope: OperationalScope;
  blocked: PreparationOperation[];
  confirmedBlockCount: number;
  dependency: DependencyAssessment;
  requirementWarnings: string[];
  ruleStatus: "unavailable" | "configured";
  timing: "unavailable" | "insufficient" | "available";
  timingReason: string;
  elapsedWorkingMinutes: number | null;
  totalWorkingMinutes: number | null;
  pauseWorkingMinutes: number | null;
  thresholdSeverity: "normal" | "attention" | "critical" | null;
  thresholdReason: string;
  limitMinutes: number | null;
  overLimit: boolean | null;
};

export function orderOperationalScope(order: DashboardOrder): OperationalScope {
  if (order.prod_status === "Instalação Agendada") return "INSTALLATION";
  if (order.prod_status === "Logística (Entrega/Transportadora)") return "LOGISTICS";
  if (order.prod_status === "Em Acabamento") return "FINISHING";
  if (order.prod_status === "Produção" || order.prod_status === "Pronto / Avisar Cliente") return "PRODUCTION";
  if (order.art_status === "Para Aprovação") return "APPROVAL";
  return "ART";
}

function policyRequired(rule: RuleSpec, kind: "owner" | "deadline", order: DashboardOrder) {
  const value = rule[kind];
  if (value === "required") return true;
  if (value === "optional") return false;
  // A conditional rule without a known predicate cannot be evaluated.
  return value === "conditional" && rule.conditionLogisticType != null &&
    rule.conditionLogisticType === order.logistic_type;
}

/** A missing owner/deadline is not a violation until an applicable rule exists. */
export function assessStageRequirements(
  order: DashboardOrder,
  ruleSource: RuleSource,
  assignees: readonly StageAssignee[],
  deadlines: readonly StageDeadline[],
): string[] {
  if (ruleSource.state !== "configured") return [];
  const scope = orderOperationalScope(order);
  const rule = ruleSource.rules.find(entry => entry.scope === scope);
  if (!rule) return [];
  const activeAssignees = assignees.filter(entry => entry.order_id === order.id);
  const activeDeadlines = deadlines.filter(entry => entry.order_id === order.id);
  // Logistics may be delivered by own team or carrier; no false mapping to INSTALLATION.
  // Não há fonte de responsável específico em APPROVAL, nem campos de
  // responsável/prazo no escopo LOGISTICS dos registros de OS.
  // Falhas de importação ou dados legados não devem inventar infrações.
  const requiredAssignee = scope !== "APPROVAL" && scope !== "LOGISTICS" &&
    policyRequired(rule, "owner", order);
  const requiredDeadline = scope !== "LOGISTICS" &&
    policyRequired(rule, "deadline", order);
  const hasScopeAssignee = activeAssignees.some(entry =>
    (entry.scope === scope || entry.scope === "GENERAL") && !!entry.user_id);
  const hasScopeDeadline = activeDeadlines.some(entry =>
    entry.scope === scope && /^\d{4}-\d{2}-\d{2}$/.test(entry.due_date));
  const messages: string[] = [];
  if (requiredAssignee && !hasScopeAssignee)
    messages.push("Responsável obrigatório não registrado para a etapa " + scope);
  if (requiredDeadline && !hasScopeDeadline)
    messages.push("Prazo obrigatório não registrado para a etapa " + scope);
  return messages;
}

function isValidOperationId(value: string, valid: Set<string>) { return valid.has(value); }

/**
 * Only persisted links between operations of the SAME order qualify.
 * A successor can have multiple predecessors; unrelated activities remain parallel.
 * No artificial sequential link from sort_order, work_center or timestamps.
 */
export function analyzeDependencies(
  orderId: string,
  items: readonly PreparationItem[],
  operations: readonly PreparationOperation[],
  source: RelationSource,
): DependencyAssessment {
  if (source.state === "unavailable") return {
    state: "unavailable", rows: [], independentIds: [],
    linkCount: 0, waitingCount: 0, confirmedBlocks: 0,
    problems: ["A estrutura de dependências ainda não está disponível. Vínculos não podem ser confirmados."],
  };
  const itemIds = new Set(items.filter(item => item.order_id === orderId && item.status !== "CANCELLED").map(item => item.id));
  const eligible = operations.filter(op => itemIds.has(op.item_id));
  const operationMap = new Map(eligible.map(op => [op.id, op]));
  const valid = new Set(operationMap.keys());
  const incoming = new Map<string, string[]>();
  const problems: string[] = [];
  const seen = new Set<string>();
  const outgoing = new Map<string, string[]>();

  for (const link of source.links.filter(link => link.order_id === orderId)) {
    const predecessor = link.predecessor_operation_id;
    const successor = link.successor_operation_id;
    if (!isValidOperationId(predecessor, valid) || !isValidOperationId(successor, valid) ||
        predecessor === successor) {
      problems.push("Vínculo com atividades ausentes, canceladas ou iguais: " + link.id);
      continue;
    }
    const key = predecessor + ":" + successor;
    if (seen.has(key)) continue;
    seen.add(key);
    incoming.set(successor, [...(incoming.get(successor) ?? []), predecessor]);
    outgoing.set(predecessor, [...(outgoing.get(predecessor) ?? []), successor]);
  }
  const visited = new Set<string>();
  const visiting = new Set<string>();
  let cyclic = false;
  function visit(id: string) {
    if (visiting.has(id)) { cyclic = true; return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of outgoing.get(id) ?? []) visit(next);
    visiting.delete(id);
    visited.add(id);
  }
  for (const op of eligible) visit(op.id);
  if (cyclic) problems.push("Os vínculos apresentam ciclo; a sequência não pode ser confirmada.");

  const rows: DependencyRow[] = eligible.map(op => {
    const predecessors = incoming.get(op.id) ?? [];
    const waitingOn = op.status === "COMPLETED" || cyclic ? [] :
      predecessors.filter(id => operationMap.get(id)?.status !== "COMPLETED");
    const blockingPredecessors = waitingOn.filter(id => operationMap.get(id)?.status === "BLOCKED");
    return {
      operationId: op.id, workCenter: op.work_center, status: op.status,
      predecessorIds: predecessors, waitingOn, blockingPredecessors,
    };
  });

  return {
    state: problems.length ? "insufficient" : "available",
    rows, independentIds: eligible.filter(op => !incoming.has(op.id) && !outgoing.has(op.id)).map(op => op.id),
    linkCount: seen.size,
    waitingCount: cyclic ? 0 : rows.filter(row => row.waitingOn.length > 0).length,
    confirmedBlocks: cyclic ? 0 : rows.filter(row => row.blockingPredecessors.length > 0).length,
    problems,
  };
}


type LocalTimeRange = { start: string; end: string };

function datePartsInZone(epochMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(epochMs));
  const value = (name: string) => Number(parts.find(part => part.type === name)?.value);
  return { year: value("year"), month: value("month"), day: value("day"),
    hour: value("hour"), minute: value("minute"), second: value("second") };
}

function localDateKey(epochMs: number, timeZone: string): string {
  const parts = datePartsInZone(epochMs, timeZone);
  return String(parts.year).padStart(4, "0") + "-" +
    String(parts.month).padStart(2, "0") + "-" + String(parts.day).padStart(2, "0");
}

function nextDateKey(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.getUTCFullYear().toString().padStart(4, "0") + "-" +
    (next.getUTCMonth() + 1).toString().padStart(2, "0") + "-" +
    next.getUTCDate().toString().padStart(2, "0");
}

function weekdayForDate(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function localDateTimeEpoch(value: string, time: string, timeZone: string): number | null {
  const [year, month, day] = value.split("-").map(Number);
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(time);
  if (!match || ![year, month, day].every(Number.isFinite)) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = targetAsUtc;

  for (let attempt = 0; attempt < 5; attempt++) {
    const observed = datePartsInZone(guess, timeZone);
    const observedAsUtc = Date.UTC(
      observed.year, observed.month - 1, observed.day,
      observed.hour, observed.minute, observed.second,
    );
    const next = targetAsUtc - (observedAsUtc - guess);
    if (next === guess) break;
    guess = next;
  }

  const finalParts = datePartsInZone(guess, timeZone);
  if (finalParts.year !== year || finalParts.month !== month || finalParts.day !== day ||
      finalParts.hour !== hour || finalParts.minute !== minute || finalParts.second !== second) return null;
  return guess;
}

/** Counts only intersections with the published local work calendar. */
export function calculateWorkingMinutes(
  startAt: string, endAt: string, calendar: WorkCalendarVersion,
  periods: readonly WorkCalendarPeriod[], exceptions: readonly WorkCalendarException[],
  scope?: OperationalScope, sectorRevisions: readonly SectorCalendarRevision[] = [],
  publishedVersions: readonly WorkCalendarVersion[] = [calendar],
): number | null {
  const startMs = Date.parse(startAt);
  const endMs = Date.parse(endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs ||
      !calendar.time_zone) return null;
  if (endMs === startMs) return 0;
  const firstDate = localDateKey(startMs, calendar.time_zone);
  const lastDate = localDateKey(endMs, calendar.time_zone);
  let date = firstDate;
  let totalMs = 0;

  for (let dayIndex = 0; dayIndex < 3700; dayIndex++) {
    const resolvedCalendar = selectGlobalCalendarForDate(publishedVersions, date);
    if (resolvedCalendar.state !== "available") return null;
    const activeCalendar = resolvedCalendar.calendar;
    if (activeCalendar.time_zone !== calendar.time_zone ||
        !periods.some(row => row.calendar_version_id === activeCalendar.id)) return null;
    const exception = exceptions.find(row =>
      row.calendar_version_id === activeCalendar.id && row.exception_date === date
    );
    let ranges: LocalTimeRange[];
    if (scope && sectorRevisions.length) {
      if (exception?.working && (!exception.starts_local || !exception.ends_local)) return null;
      const day = resolveSectorCalendarDay({
        date, scope, baseCalendarId: activeCalendar.id,
        baseWeek: periods.filter(row => row.calendar_version_id === activeCalendar.id)
          .map(row => ({ weekday: row.weekday, start: row.starts_local.slice(0, 5),
            end: row.ends_local.slice(0, 5) })),
        baseException: exception
          ? { windows: exception.working
              ? [{ start: exception.starts_local!.slice(0, 5), end: exception.ends_local!.slice(0, 5) }]
              : [], reason: "Exceção do calendário padrão" }
          : null,
        sectorRevisions,
      });
      if (day.state !== "available") return null;
      ranges = day.windows;
    } else if (exception) {
      if (!exception.working) ranges = [];
      else if (exception.starts_local && exception.ends_local)
        ranges = [{ start: exception.starts_local, end: exception.ends_local }];
      else return null;
    } else {
      ranges = periods.filter(row =>
        row.calendar_version_id === activeCalendar.id && row.weekday === weekdayForDate(date)
      ).map(row => ({ start: row.starts_local, end: row.ends_local }))
        .sort((a,b) => a.start.localeCompare(b.start));
    }

    for (let index = 0; index < ranges.length; index++) {
      const range = ranges[index];
      if (!range.start || !range.end || range.end <= range.start) return null;
      if (index > 0 && range.start < ranges[index - 1].end) return null;
      const rangeStart = localDateTimeEpoch(date, range.start, calendar.time_zone);
      const rangeEnd = localDateTimeEpoch(date, range.end, calendar.time_zone);
      if (rangeStart === null || rangeEnd === null || rangeEnd <= rangeStart) return null;
      totalMs += Math.max(0, Math.min(endMs, rangeEnd) - Math.max(startMs, rangeStart));
    }

    if (date === lastDate) return Math.floor(totalMs / 60_000);
    date = nextDateKey(date);
  }
  return null;
}

function mergePauseRanges(
  pauses: readonly StagePause[], intervalStart: number, intervalEnd: number,
): Array<{ start: number; end: number }> | null {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const pause of pauses) {
    if (pause.evidence_state !== "verified") return null;
    const start = Date.parse(pause.started_at);
    const end = pause.ended_at ? Date.parse(pause.ended_at) : intervalEnd;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < intervalStart ||
        end > intervalEnd || end <= start || !pause.operation_id) return null;
    ranges.push({ start, end });
  }
  ranges.sort((a,b) => a.start - b.start || a.end - b.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

type TimingAssessment = {
  state: "unavailable" | "insufficient" | "available";
  reason: string;
  elapsedWorkingMinutes: number | null;
  totalWorkingMinutes: number | null;
  pauseWorkingMinutes: number | null;
  limitMinutes: number | null;
  overLimit: boolean | null;
};

function unavailableTiming(reason: string, state: "unavailable" | "insufficient" = "unavailable"): TimingAssessment {
  return {
    state, reason, elapsedWorkingMinutes: null,
    totalWorkingMinutes: null, pauseWorkingMinutes: null,
    limitMinutes: null, overLimit: null,
  };
}

function assessStageTiming(
  order: DashboardOrder, scope: OperationalScope, sources: AdvancedSources, now: Date,
): TimingAssessment {
  if (!sources.timingEvidenceAvailable)
    return unavailableTiming("As tabelas de evidência temporal não estão disponíveis para esta consulta.");
  const openIntervals = sources.stageIntervals.filter(interval =>
    interval.order_id === order.id && interval.scope === scope && interval.left_at === null
  );
  if (!openIntervals.length)
    return unavailableTiming("Ainda não há intervalo de etapa aberto registrado para esta OS.");
  if (openIntervals.length !== 1)
    return unavailableTiming("Há mais de um intervalo aberto para esta etapa; a medição foi suspensa.", "insufficient");

  const interval = openIntervals[0];
  if (interval.evidence_state !== "verified")
    return unavailableTiming("O marco inicial desta OS é unverified; não será usado para calcular duração.", "insufficient");
  if (!interval.calendar_version_id || !interval.rule_revision_id)
    return unavailableTiming("O intervalo não possui revisão de regra e calendário vinculados.");
  const rule = sources.timingRules.find(row => row.scope === scope);
  if (!rule || !rule.calendar_version_id || !rule.calendar_verified)
    return unavailableTiming("Não há regra com calendário verificado para esta etapa.");
  const ruleUpdated = Date.parse(rule.updated_at);
  const intervalStart = Date.parse(interval.entered_at);
  const intervalEnd = now.getTime();
  if (!Number.isFinite(ruleUpdated) || !Number.isFinite(intervalStart) ||
      !Number.isFinite(intervalEnd) || intervalEnd < intervalStart)
    return unavailableTiming("Datas da regra ou do intervalo são inválidas.", "insufficient");
  if (rule.updated_at && ruleUpdated > intervalStart)
    return unavailableTiming("A regra foi alterada depois da entrada nesta etapa; a revisão histórica precisa ser consultada.", "insufficient");
  if (rule.calendar_version_id !== interval.calendar_version_id)
    return unavailableTiming("O calendário atual não corresponde ao calendário registrado na entrada da etapa.", "insufficient");

  const calendar = sources.calendars.find(row => row.id === interval.calendar_version_id);
  if (!calendar) return unavailableTiming("A versão do calendário vinculada ao intervalo não está disponível.");
  const startDate = localDateKey(intervalStart, calendar.time_zone);
  const endDate = localDateKey(intervalEnd, calendar.time_zone);
  const entryCalendar = selectGlobalCalendarForDate(sources.calendars, startDate);
  if (entryCalendar.state !== "available" ||
      entryCalendar.calendar.id !== interval.calendar_version_id)
    return unavailableTiming("O calendário registrado na entrada não corresponde à versão vigente naquela data.", "insufficient");
  // Calendar successors during a stage are resolved per day below. Never
  // rewrite or extrapolate the stage's original calendar evidence.
  const endCalendar = selectGlobalCalendarForDate(sources.calendars, endDate);
  if (endCalendar.state !== "available")
    return unavailableTiming("Não há calendário publicado para toda a permanência observada.", "insufficient");

  const activeItemIds = new Set(sources.items.filter(item =>
    item.order_id === order.id && item.status !== "CANCELLED"
  ).map(item => item.id));
  const operations = sources.operations.filter(operation => activeItemIds.has(operation.item_id));
  for (const operation of operations) {
    const createdAt = operation.created_at ? Date.parse(operation.created_at) : Number.NaN;
    if (!Number.isFinite(createdAt) || createdAt < intervalStart || createdAt > intervalEnd)
      return unavailableTiming("Há atividades anteriores ao início da coleta; o histórico de pausas não é integral.", "insufficient");
  }

  const pauses = sources.stagePauses.filter(pause => pause.stage_interval_id === interval.id);
  const knownOperationIds = new Set(operations.map(operation => operation.id));
  if (pauses.some(pause => !pause.operation_id || !knownOperationIds.has(pause.operation_id)))
    return unavailableTiming("Há pausa ligada a uma atividade excluída, movida ou não consultável; a medição foi suspensa.", "insufficient");
  for (const operation of operations) {
    const operationPauses = pauses.filter(pause => pause.operation_id === operation.id);
    const openPauses = operationPauses.filter(pause => pause.ended_at === null);
    if (operation.status === "BLOCKED" && openPauses.length !== 1)
      return unavailableTiming("Uma operação está BLOCKED sem uma pausa aberta única e verificável.", "insufficient");
    if (operation.status !== "BLOCKED" && openPauses.length > 0)
      return unavailableTiming("Há pausa aberta para uma operação que não está BLOCKED.", "insufficient");
  }

  const mergedPauses = mergePauseRanges(pauses, intervalStart, intervalEnd);
  if (!mergedPauses)
    return unavailableTiming("Existem pausas sem evidência completa ou com datas inconsistentes.", "insufficient");

  if (rule.stalled_limit_minutes !== null &&
      (!Number.isSafeInteger(rule.stalled_limit_minutes) || rule.stalled_limit_minutes <= 0))
    return unavailableTiming("O limite publicado para esta etapa é inválido.", "insufficient");
  const calendarPeriods = sources.calendarPeriods;
  if (!calendarPeriods.some(row => row.calendar_version_id === calendar.id))
    return unavailableTiming("A versão do calendário não possui intervalos semanais legíveis.", "insufficient");
  const calendarExceptions = sources.calendarExceptions;
  const sectorRevisions = sources.sectorCalendars?.state === "available"
    ? sources.sectorCalendars.revisions : [];
  const grossMinutes = calculateWorkingMinutes(interval.entered_at, now.toISOString(),
    calendar, calendarPeriods, calendarExceptions, scope, sectorRevisions, sources.calendars);
  if (grossMinutes === null)
    return unavailableTiming("Não foi possível interpretar todos os horários locais do calendário.", "insufficient");

  let pauseMinutes = 0;
  for (const pause of mergedPauses) {
    const pauseMinutesForCalendar = calculateWorkingMinutes(
      new Date(pause.start).toISOString(), new Date(pause.end).toISOString(),
      calendar, calendarPeriods, calendarExceptions, scope, sectorRevisions,
      sources.calendars,
    );
    if (pauseMinutesForCalendar === null)
      return unavailableTiming("Não foi possível calcular uma pausa usando o calendário publicado.", "insufficient");
    pauseMinutes += pauseMinutesForCalendar;
  }

  const elapsedWorkingMinutes = Math.max(0, grossMinutes - pauseMinutes);
  const limitMinutes = rule.stalled_limit_minutes;
  const overLimit = limitMinutes === null ? null : elapsedWorkingMinutes >= limitMinutes;
  const reason = limitMinutes === null
    ? "Permanência útil calculada; não há limite de alerta publicado para esta etapa."
    : overLimit
      ? "Permanência útil atingiu ou ultrapassou o limite publicado. Isso sinaliza excedente de permanência, mas não comprova sozinho a causa."
      : "Permanência útil dentro do limite publicado.";
  return {
    state: "available", reason, elapsedWorkingMinutes,
    totalWorkingMinutes: grossMinutes, pauseWorkingMinutes: pauseMinutes,
    limitMinutes, overLimit,
  };
}

/**
 * BLOCKED is a confirmed status. Useful stage time is calculated only from a
 * verified interval, unchanged rule revision, covering calendar and complete
 * pause evidence. Exceeding a limit signals extra permanence, not its cause.
 */
export function buildAdvancedAssessments(
  orders: readonly DashboardOrder[], sources: AdvancedSources, now: Date = new Date()
): AdvancedOrderAssessment[] {
  const itemsByOrder = new Map<string, PreparationItem[]>();
  for (const item of sources.items) itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) ?? []), item]);
  const operationsByItem = new Map<string, PreparationOperation[]>();
  for (const op of sources.operations) operationsByItem.set(op.item_id, [...(operationsByItem.get(op.item_id) ?? []), op]);
  return orders.map(order => {
    const items = itemsByOrder.get(order.id) ?? [];
    const activeIds = new Set(items.filter(item => item.status !== "CANCELLED").map(item => item.id));
    const operations = items.flatMap(item => operationsByItem.get(item.id) ?? []);
    const blocked = operations.filter(op => activeIds.has(op.item_id) && op.status === "BLOCKED");
    const dependency = analyzeDependencies(order.id, items, operations, sources.dependencies);
    const rules = sources.rules;
    const scope = orderOperationalScope(order);
    const configuredScopeRule = rules.state === "configured" && rules.rules.some(r => r.scope === scope);
    const timing = assessStageTiming(order, scope, sources, now);
    const published = sources.thresholds?.state === "available"
      ? sources.thresholds.rows.find(row => row.scope === scope) : undefined;
    const currentInterval = sources.stageIntervals.find(interval =>
      interval.order_id === order.id && interval.scope === scope && interval.left_at === null
    );
    const pinnedCalendar = sources.calendars.find(row => row.id === currentInterval?.calendar_version_id);
    const calendarCurrent = pinnedCalendar
      ? selectGlobalCalendarForDate(sources.calendars, localDateKey(now.getTime(), pinnedCalendar.time_zone))
      : null;
    // A rule bound to the OLD calendar is never silently treated as if
    // it had been reviewed for a newly published global workweek.
    const thresholdCanApply = Boolean(
      published && currentInterval &&
      currentInterval.calendar_version_id === published.calendar_version_id &&
      Date.parse(published.effective_from) <= Date.parse(currentInterval.entered_at) &&
      calendarCurrent?.state === "available" &&
      calendarCurrent.calendar.id === currentInterval.calendar_version_id
    );
    const threshold = published && thresholdCanApply
      ? assessOperationalThreshold(timing.totalWorkingMinutes, {
          attentionMinutes: published.attention_limit_minutes,
          criticalMinutes: published.critical_limit_minutes,
        })
      : {
          state: "unavailable" as const, severity: null,
          reason: published
            ? "Os novos limites não cobrem a revisão e vigência desta entrada na etapa."
            : "Limites Atenção/Crítico não publicados ou indisponíveis para este setor.",
        };
    return {
      order, scope, blocked,
      confirmedBlockCount: blocked.length, dependency,
      requirementWarnings: assessStageRequirements(order, rules, sources.assignees, sources.deadlines),
      ruleStatus: configuredScopeRule ? "configured" : "unavailable",
      timing: timing.state,
      timingReason: timing.reason,
      elapsedWorkingMinutes: timing.elapsedWorkingMinutes,
      totalWorkingMinutes: timing.totalWorkingMinutes,
      pauseWorkingMinutes: timing.pauseWorkingMinutes,
      thresholdSeverity: threshold.severity,
      thresholdReason: threshold.reason,
      limitMinutes: timing.limitMinutes,
      overLimit: timing.overLimit,
    };
  });
}

export function advancedSummary(rows: readonly AdvancedOrderAssessment[]) {
  return {
    orders: rows.length,
    withConfirmedBlocks: rows.filter(row => row.confirmedBlockCount > 0).length,
    withMissingRequirements: rows.filter(row => row.requirementWarnings.length > 0).length,
    waitingSuccessors: rows.reduce((acc, row) => acc + (row.dependency.state === "available" ? row.dependency.waitingCount : 0), 0),
    rulesAvailable: rows.some(row => row.ruleStatus === "configured"),
    linksAvailable: rows.some(row => row.dependency.state !== "unavailable"),
  };
}
