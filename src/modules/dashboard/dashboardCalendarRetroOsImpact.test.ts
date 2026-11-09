import { describe, expect, it } from "vitest";
import type { AdvancedSources } from "./dashboardAdvanced";
import type { CalendarRetroRequest } from "./dashboardCalendarRetroRepository";
import { simulateCalendarRetroOsImpact } from "./dashboardCalendarRetroOsImpact";

const request = {
  id: "request-1", calendar_version_id: "calendar-1", exception_date: "2026-11-06",
  proposed_working: false, proposed_start: null, proposed_end: null,
} as CalendarRetroRequest;
const asOf = "2026-11-06T14:00:00.000Z";

function sources(): AdvancedSources {
  return {
    timingEvidenceAvailable: true,
    stageIntervals: [{
      id: "interval-1", order_id: "order-1", scope: "PRODUCTION",
      entered_at: "2026-11-06T11:00:00.000Z", left_at: null,
      calendar_version_id: "calendar-1", rule_revision_id: "rule-1", evidence_state: "verified",
    }],
    stagePauses: [{
      id: "pause-1", stage_interval_id: "interval-1", operation_id: "operation-1",
      started_at: "2026-11-06T12:00:00.000Z",
      ended_at: "2026-11-06T12:30:00.000Z",
      reason: "Bloqueio comprovado", evidence_state: "verified",
    }],
    calendars: [{
      id: "calendar-1", version: 1, time_zone: "America/Sao_Paulo",
      effective_from: "2026-11-01", effective_until: null,
    }],
    calendarPeriods: [{
      id: "period-1", calendar_version_id: "calendar-1",
      weekday: 5, starts_local: "08:00", ends_local: "12:00",
    }],
    calendarExceptions: [],
    sectorCalendars: { state: "available", revisions: [] },
    thresholds: { state: "available", rows: [{
      scope: "PRODUCTION", attention_limit_minutes: 120, critical_limit_minutes: 200,
      calendar_version_id: "calendar-1", revision: 1,
      effective_from: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z",
    }] },
    timingRules: [{
      id: "rule-1", scope: "PRODUCTION", stalled_limit_minutes: null,
      calendar_version_id: "calendar-1", calendar_verified: true,
      revision: 1, updated_at: "2026-11-01T00:00:00Z",
    }],
    items: [{ id: "item-1", order_id: "order-1", status: "ACTIVE" }],
    operations: [{
      id: "operation-1", item_id: "item-1",
      status: "IN_PROGRESS", created_at: "2026-11-06T11:05:00Z",
    }],
    assignees: [], deadlines: [], rules: { state: "unavailable" },
    dependencies: { state: "unavailable" }, events: [],
  } as unknown as AdvancedSources;
}

describe("simulação retroativa por OS — somente leitura", () => {
  it("recalcula jornada, pausas e alerta sobre evidência verificada", () => {
    const result = simulateCalendarRetroOsImpact({
      request, sources: sources(), candidateOrderIds: ["order-1"], asOf,
    });
    expect(result.rows[0]).toMatchObject({
      state: "verified", grossBefore: 180, grossProposed: 0,
      pausesBefore: 30, pausesProposed: 0,
      usefulBefore: 150, usefulProposed: 0,
      severityBefore: "attention", severityProposed: "normal", alertsVerified: true,
    });
    expect(result.verifiedAlertChanges).toBe(1);
    expect(result.approvalAllowed).toBe(false);
  });
  it("nunca converte pausa sem evidência em impacto zero ou aprovação", () => {
    const incomplete = sources();
    incomplete.stagePauses[0].evidence_state = "unverified";
    const result = simulateCalendarRetroOsImpact({
      request, sources: incomplete, candidateOrderIds: ["order-1"], asOf,
    });
    expect(result.rows[0].state).toBe("insufficient");
    expect(result.rows[0].grossBefore).toBeNull();
    expect(result.insufficientIntervals).toBe(1);
    expect(result.approvalAllowed).toBe(false);
  });
});
