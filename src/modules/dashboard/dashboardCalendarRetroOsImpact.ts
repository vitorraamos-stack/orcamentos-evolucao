import {
  calculateWorkingMinutes, localDateKey, localDateTimeEpoch, mergePauseRanges,
  type AdvancedSources, type OperationalScope, type StageInterval, type WorkCalendarException,
} from "./dashboardAdvanced";
import { assessOperationalThreshold } from "./dashboardOperationalPolicy";
import { selectGlobalCalendarForDate } from "./dashboardCalendarTimeline";
import type { CalendarRetroRequest } from "./dashboardCalendarRetroRepository";

export type RetroSeverity = "normal" | "attention" | "critical";
export type RetroOsImpactRow = {
  orderId: string;
  intervalId: string | null;
  scope: OperationalScope | null;
  state: "verified" | "insufficient";
  reason: string;
  grossBefore: number | null;
  grossProposed: number | null;
  pausesBefore: number | null;
  pausesProposed: number | null;
  usefulBefore: number | null;
  usefulProposed: number | null;
  severityBefore: RetroSeverity | null;
  severityProposed: RetroSeverity | null;
  alertsVerified: boolean;
};
export type RetroOsImpactResult = {
  asOf: string;
  requestId: string;
  candidateOrders: number;
  rows: RetroOsImpactRow[];
  verifiedIntervals: number;
  insufficientIntervals: number;
  changedIntervals: number;
  verifiedAlertChanges: number;
  allVerified: boolean;
  approvalAllowed: false;
};

const emptyRow = (orderId: string, interval: StageInterval | null, reason: string): RetroOsImpactRow => ({
  orderId, intervalId: interval?.id ?? null, scope: interval?.scope ?? null,
  state: "insufficient", reason,
  grossBefore: null, grossProposed: null,
  pausesBefore: null, pausesProposed: null,
  usefulBefore: null, usefulProposed: null,
  severityBefore: null, severityProposed: null, alertsVerified: false,
});

function validIntervalScope(scope: string): scope is OperationalScope {
  return ["ART", "APPROVAL", "PRODUCTION", "FINISHING", "INSTALLATION", "LOGISTICS"].includes(scope);
}

/** 
 * Pure read-only what-if calculation. It uses the same time-zone-aware
 * calendar and pause functions as the Dashboard. No history is rewritten.
 *
 * "verified" describes the stage-minute calculation only. Approval stays
 * disabled even if all rows have enough evidence: publishing a historical
 * correction needs a separate audited and authorized workflow.
 */
export function simulateCalendarRetroOsImpact(input: {
  request: CalendarRetroRequest;
  candidateOrderIds: readonly string[];
  sources: AdvancedSources;
  asOf: string;
}): RetroOsImpactResult {
  const { request, sources, asOf } = input;
  const candidateIds = Array.from(new Set(input.candidateOrderIds));
  const asOfMs = Date.parse(asOf);
  const startMs = localDateTimeEpoch(request.exception_date, "00:00", "America/Sao_Paulo");
  const nextDate = new Date(Date.parse(request.exception_date + "T12:00:00Z") + 86_400_000)
    .toISOString().slice(0, 10);
  const endMs = localDateTimeEpoch(nextDate, "00:00", "America/Sao_Paulo");
  const rows: RetroOsImpactRow[] = [];
  if (!Number.isFinite(asOfMs) || startMs === null || endMs === null ||
      asOfMs < startMs || endMs <= startMs || !sources.timingEvidenceAvailable ||
      sources.sectorCalendars?.state !== "available") {
    const reason = "Evidência temporal, calendário setorial ou data de consulta indisponível.";
    for (const id of candidateIds) rows.push(emptyRow(id, null, reason));
    return assemble(asOf, request.id, candidateIds.length, rows);
  }

  const resolved = selectGlobalCalendarForDate(sources.calendars, request.exception_date);
  if (resolved.state !== "available" || resolved.calendar.id !== request.calendar_version_id) {
    for (const id of candidateIds) rows.push(emptyRow(id, null,
      "A versão do calendário deixou de corresponder à data da solicitação."));
    return assemble(asOf, request.id, candidateIds.length, rows);
  }
  const baseline = sources.calendarExceptions;
  const proposedException: WorkCalendarException = {
    id: "review-only-" + request.id, calendar_version_id: request.calendar_version_id,
    exception_date: request.exception_date, working: request.proposed_working,
    starts_local: request.proposed_working ? request.proposed_start : null,
    ends_local: request.proposed_working ? request.proposed_end : null,
  };
  const proposed = baseline.filter(row =>
    row.calendar_version_id !== request.calendar_version_id ||
    row.exception_date !== request.exception_date
  ).concat(proposedException);

  for (const orderId of candidateIds) {
    const found = sources.stageIntervals.filter(interval => {
      if (interval.order_id !== orderId) return false;
      const enteredMs = Date.parse(interval.entered_at);
      const leftMs = Date.parse(interval.left_at ?? asOf);
      return Number.isFinite(enteredMs) && Number.isFinite(leftMs) &&
        enteredMs < endMs && leftMs > startMs;
    });
    if (!found.length) {
      rows.push(emptyRow(orderId, null, "Intervalo candidato não localizado ou alterado durante a leitura."));
      continue;
    }
    for (const interval of found) {
      const reject = (reason: string) => rows.push(emptyRow(orderId, interval, reason));
      const enteredMs = Date.parse(interval.entered_at);
      const actualEndMs = Date.parse(interval.left_at ?? asOf);
      if (!validIntervalScope(interval.scope) || interval.evidence_state !== "verified" ||
          !interval.calendar_version_id || !interval.rule_revision_id ||
          !Number.isFinite(enteredMs) || !Number.isFinite(actualEndMs) ||
          enteredMs >= actualEndMs || actualEndMs > asOfMs) {
        reject("Marcos de início/fim ou revisão histórica não verificados.");
        continue;
      }
      const calendar = sources.calendars.find(c => c.id === interval.calendar_version_id);
      if (!calendar || calendar.time_zone !== "America/Sao_Paulo" ||
          selectGlobalCalendarForDate(sources.calendars, localDateKey(enteredMs, calendar.time_zone))
            .calendar?.id !== interval.calendar_version_id) {
        reject("Calendário da entrada não comprovado ou fora da vigência.");
        continue;
      }
      const activeItems = sources.items.filter(item => item.order_id === orderId &&
        item.status !== "CANCELLED");
      const itemIds = new Set(activeItems.map(item => item.id));
      const operations = sources.operations.filter(op => itemIds.has(op.item_id));
      const knownOperations = new Set(operations.map(op => op.id));
      const pauses = sources.stagePauses.filter(pause => pause.stage_interval_id === interval.id);
      if (pauses.some(pause => !pause.operation_id || !knownOperations.has(pause.operation_id))) {
        reject("Existem pausas associadas a operações não verificáveis.");
        continue;
      }
      if (operations.some(op => !op.created_at || !Number.isFinite(Date.parse(op.created_at)) ||
          Date.parse(op.created_at) < enteredMs || Date.parse(op.created_at) > actualEndMs)) {
        reject("O histórico de atividades não cobre a etapa integralmente.");
        continue;
      }
      // For currently open stages only, enforce consistency between BLOCKED
      // operations and their open pauses. Older statuses are not reconstructed.
      if (interval.left_at === null && operations.some(op => {
        const open = pauses.filter(p => p.operation_id === op.id && p.ended_at === null).length;
        return op.status === "BLOCKED" ? open !== 1 : open > 0;
      })) {
        reject("Pausas abertas não correspondem aos bloqueios registrados.");
        continue;
      }
      const ranges = mergePauseRanges(pauses, enteredMs, actualEndMs);
      if (ranges === null) {
        reject("Pausas sem comprovação, intervalos inválidos ou evidência incompleta.");
        continue;
      }
      const timeStart = interval.entered_at;
      const timeEnd = new Date(actualEndMs).toISOString();
      const args = [calendar, sources.calendarPeriods, baseline, interval.scope,
        sources.sectorCalendars.revisions, sources.calendars] as const;
      const nextArgs = [calendar, sources.calendarPeriods, proposed, interval.scope,
        sources.sectorCalendars.revisions, sources.calendars] as const;
      const grossBefore = calculateWorkingMinutes(timeStart, timeEnd, ...args);
      const grossProposed = calculateWorkingMinutes(timeStart, timeEnd, ...nextArgs);
      if (grossBefore === null || grossProposed === null) {
        reject("O calendário completo dessa etapa não possui horários verificáveis.");
        continue;
      }
      let pausedBefore = 0;
      let pausedProposed = 0;
      let pauseValid = true;
      for (const range of ranges) {
        const start = new Date(range.start).toISOString();
        const end = new Date(range.end).toISOString();
        const oldMinutes = calculateWorkingMinutes(start, end, ...args);
        const newMinutes = calculateWorkingMinutes(start, end, ...nextArgs);
        if (oldMinutes === null || newMinutes === null) {
          pauseValid = false; break;
        }
        pausedBefore += oldMinutes;
        pausedProposed += newMinutes;
      }
      if (!pauseValid || pausedBefore > grossBefore || pausedProposed > grossProposed) {
        reject("Não foi possível comprovar o consumo de horas úteis das pausas.");
        continue;
      }
      const threshold = sources.thresholds?.state === "available"
        ? sources.thresholds.rows.find(row => row.scope === interval.scope) : undefined;
      const currentCalendar = selectGlobalCalendarForDate(
        sources.calendars, localDateKey(asOfMs, calendar.time_zone)
      );
      const rule = sources.timingRules.find(row => row.scope === interval.scope);
      const alertEligible = interval.left_at === null && Boolean(threshold && rule &&
        threshold.calendar_version_id === interval.calendar_version_id &&
        rule.calendar_version_id === interval.calendar_version_id &&
        rule.calendar_verified && Date.parse(rule.updated_at) <= enteredMs &&
        Date.parse(threshold.effective_from) <= enteredMs &&
        currentCalendar.state === "available" &&
        currentCalendar.calendar.id === interval.calendar_version_id);
      const oldAlert = alertEligible && threshold
        ? assessOperationalThreshold(grossBefore, {
          attentionMinutes: threshold.attention_limit_minutes,
          criticalMinutes: threshold.critical_limit_minutes,
        }) : null;
      const nextAlert = alertEligible && threshold
        ? assessOperationalThreshold(grossProposed, {
          attentionMinutes: threshold.attention_limit_minutes,
          criticalMinutes: threshold.critical_limit_minutes,
        }) : null;
      const alertsVerified = oldAlert?.state === "available" && nextAlert?.state === "available";
      rows.push({
        orderId, intervalId: interval.id, scope: interval.scope,
        state: "verified", reason: "Horas úteis da etapa e pausas calculadas sobre evidências consultadas.",
        grossBefore, grossProposed, pausesBefore: pausedBefore, pausesProposed: pausedProposed,
        usefulBefore: Math.max(0, grossBefore - pausedBefore),
        usefulProposed: Math.max(0, grossProposed - pausedProposed),
        severityBefore: alertsVerified ? oldAlert.severity : null,
        severityProposed: alertsVerified ? nextAlert.severity : null,
        alertsVerified,
      });
    }
  }
  return assemble(asOf, request.id, candidateIds.length, rows);
}

function assemble(
  asOf: string, requestId: string, candidateOrders: number, rows: RetroOsImpactRow[],
): RetroOsImpactResult {
  return {
    asOf, requestId, candidateOrders, rows,
    verifiedIntervals: rows.filter(row => row.state === "verified").length,
    insufficientIntervals: rows.filter(row => row.state !== "verified").length,
    changedIntervals: rows.filter(row =>
      row.state === "verified" && row.grossBefore !== row.grossProposed).length,
    verifiedAlertChanges: rows.filter(row => row.alertsVerified &&
      row.severityBefore !== row.severityProposed).length,
    allVerified: rows.every(row => row.state === "verified"),
    approvalAllowed: false,
  };
}
