import { describe, expect, it } from "vitest";
import type { DashboardOrder } from "./dashboardModel";
import {
  advancedSummary, analyzeDependencies, assessStageRequirements, buildAdvancedAssessments,
  calculateWorkingMinutes, orderOperationalScope, type AdvancedSources, type OperationDependency, type RuleSource,
} from "./dashboardAdvanced";
import type { PreparationItem, PreparationOperation } from "./dashboardPreparation";

const order = (id = "os1", extra: Partial<DashboardOrder> = {}): DashboardOrder => ({
  id, sale_number: "100", client_name: "Cliente", title: "Letreiro",
  delivery_date: "2026-11-08", updated_at: "2026-11-06T12:00:00Z",
  prod_status: "Produção", art_status: "Produzir", production_tag: "EM_PRODUCAO",
  logistic_type: "instalacao", archived: false, is_urgent: false, art_direction_tag: null,
  ...extra,
});
const item = (id: string, orderId = "os1"): PreparationItem => ({
  id, order_id: orderId, name: "Item", status: "IN_PROGRESS",
  updated_at: "2026-11-06T12:00:00Z",
});
const operation = (id: string, itemId = "i1",
  extra: Partial<PreparationOperation> = {}): PreparationOperation => ({
  id, item_id: itemId, work_center: "PRINTING", status: "PENDING",
  is_required: true, blocked_reason: null, assigned_to: "user",
  updated_at: "2026-11-06T12:00:00Z", created_at: "2026-11-06T12:00:00Z", ...extra,
});
const link = (id: string, before: string, after: string, orderId="os1"): OperationDependency => ({
  id, order_id: orderId, predecessor_operation_id: before, successor_operation_id: after,
});
const configured: RuleSource = {
  state: "configured",
  rules: [
    { scope: "PRODUCTION", owner: "required", deadline: "conditional", conditionLogisticType: "instalacao",
      stalledLimitMinutes: 240, calendarVerified: true },
    { scope: "ART", owner: "optional", deadline: "optional", conditionLogisticType: null,
      stalledLimitMinutes: null, calendarVerified: false },
  ],
};
const basic: AdvancedSources = {
  items: [item("i1")],
  operations: [
    operation("a", "i1", { status: "BLOCKED", blocked_reason: "Aguardando material" }),
    operation("b"), operation("c"), operation("d", "i1", { status: "COMPLETED" }),
  ],
  deadlines: [], assignees: [],
  rules: { state: "unavailable" }, dependencies: { state: "unavailable" }, events: [],
  timingRules: [], timingEvidenceAvailable: true, stageIntervals: [], stagePauses: [],
  calendars: [], calendarPeriods: [], calendarExceptions: [],
};

describe("Dashboard Etapa 4 — requisitos por etapa e provas", () => {
  it("does not report missing owner/deadline without a configured rule", () => {
    expect(assessStageRequirements(order(), { state: "unavailable" }, [], [])).toEqual([]);
    const result = buildAdvancedAssessments([order()], basic);
    expect(result[0].confirmedBlockCount).toBe(1);
    expect(result[0].requirementWarnings).toEqual([]);
    expect(result[0].timing).toBe("unavailable");
    expect(result[0].dependency.state).toBe("unavailable");
  });
  it("only flags an applicable requirement, distinguishing optional and conditional", () => {
    expect(assessStageRequirements(order(), configured, [], [])).toHaveLength(2);
    expect(assessStageRequirements(order("os1", { logistic_type: "entrega" }), configured, [], [])).toHaveLength(1);
    expect(assessStageRequirements(order("os1", { prod_status: "Arte", art_status: "Em Criação" }), configured, [], [])).toEqual([]);
    expect(assessStageRequirements(order(), configured, [
      { id: "user1", order_id: "os1", scope: "GENERAL", user_id: "user" },
    ], [{ id: "date1", order_id: "os1", scope: "PRODUCTION", due_date: "2026-11-08", completed_at: null }])).toEqual([]);
  });
  it("supports retirada without treating unsupported sectors as evidence of missing obligations", () => {
    const retirada: RuleSource = { state: "configured", rules: [{
      scope: "PRODUCTION", owner: "conditional", deadline: "optional",
      conditionLogisticType: "retirada", stalledLimitMinutes: null, calendarVerified: false,
    }] };
    expect(assessStageRequirements(order("os1", { logistic_type: "retirada" }), retirada, [], [])).toHaveLength(1);
    expect(assessStageRequirements(order("os1", { logistic_type: "entrega" }), retirada, [], [])).toHaveLength(0);
    const unsupported: RuleSource = { state: "configured", rules: [{
      scope: "LOGISTICS", owner: "required", deadline: "required",
      conditionLogisticType: null, stalledLimitMinutes: null, calendarVerified: false,
    }] };
    expect(assessStageRequirements(order("os1", {
      prod_status: "Logística (Entrega/Transportadora)",
    }), unsupported, [], [])).toEqual([]);
  });
  it("never maps delivery to installation automatically", () => {
    expect(orderOperationalScope(order("os2", { prod_status: "Logística (Entrega/Transportadora)" }))).toBe("LOGISTICS");
    expect(orderOperationalScope(order("os2", { prod_status: "Instalação Agendada" }))).toBe("INSTALLATION");
  });
});

describe("Dashboard Etapa 4 — dependências somente registradas", () => {
  it("marks schema unavailable instead of asserting no dependencies", () => {
    const result = analyzeDependencies("os1", [item("i1")], [operation("a")], { state: "unavailable" });
    expect(result.state).toBe("unavailable");
    expect(result.independentIds).toEqual([]);
    expect(result.problems[0]).toContain("não está disponível");
  });

  it("supports two predecessors and parallel independent work without fabricating order", () => {
    const result = analyzeDependencies("os1", [item("i1")], [
      operation("a", "i1", { status: "COMPLETED", work_center: "PRINTING" }),
      operation("b", "i1", { status: "BLOCKED", work_center: "METALWORK" }),
      operation("c", "i1", { status: "PENDING", work_center: "ASSEMBLY" }),
      operation("d", "i1", { status: "IN_PROGRESS", work_center: "ELECTRICAL_LIGHTING" }),
    ], { state: "available", links: [link("l1", "a", "c"), link("l2", "b", "c")] });
    expect(result.state).toBe("available");
    expect(result.linkCount).toBe(2);
    expect(result.waitingCount).toBe(1);
    expect(result.confirmedBlocks).toBe(1);
    const successor = result.rows.find(row => row.operationId === "c");
    expect(successor?.predecessorIds).toEqual(["a","b"]);
    expect(successor?.waitingOn).toEqual(["b"]);
    expect(successor?.blockingPredecessors).toEqual(["b"]);
    expect(result.independentIds).toEqual(["d"]);
  });

  it("a pending predecessor is legitimate waiting, not a proven bottleneck", () => {
    const result = analyzeDependencies("os1", [item("i1")], [operation("a"),operation("b")],
      { state: "available", links: [link("l1", "a", "b")] });
    expect(result.waitingCount).toBe(1);
    expect(result.confirmedBlocks).toBe(0);
  });

  it("rejects cross-order, deleted/cancelled, self and unknown links", () => {
    const result = analyzeDependencies("os1", [item("i1"), { ...item("i2"), status: "CANCELLED" }, item("i3","os2")],
      [operation("a"), operation("b","i2"), operation("c","i3")],
      { state: "available", links: [link("l1","a","b"),link("l2","a","c"),
        link("l3","a","a"),link("l4","a","missing")] });
    expect(result.state).toBe("insufficient");
    expect(result.linkCount).toBe(0);
    expect(result.problems).toHaveLength(4);
    expect(result.waitingCount).toBe(0);
  });

  it("flags cyclic history instead of returning invented successor status", () => {
    const result = analyzeDependencies("os1", [item("i1")], [operation("a"), operation("b")],
      { state: "available", links: [link("l1","a","b"),link("l2","b","a")] });
    expect(result.state).toBe("insufficient");
    expect(result.problems.some(x=>x.includes("ciclo"))).toBe(true);
    expect(result.waitingCount).toBe(0);
  });

  it("deduplicates OS counts and preserves confirmed blocks independently of links", () => {
    const rows = buildAdvancedAssessments([
      order("os1"), order("os2", { sale_number: "200" }),
    ], { ...basic, dependencies: { state: "available", links: [link("l1","a","b")] } });
    const summary = advancedSummary(rows);
    expect(summary.orders).toBe(2);
    expect(summary.withConfirmedBlocks).toBe(1);
    expect(summary.waitingSuccessors).toBe(1);
  });
});


describe("Dashboard Etapa 4 — permanência útil com evidência verificável", () => {
  const now = new Date("2026-11-02T15:00:00.000Z"); // segunda-feira, 12:00 em São Paulo
  const interval = {
    id: "interval-1", order_id: "os1", scope: "PRODUCTION" as const,
    entered_at: "2026-11-02T11:00:00.000Z", left_at: null,
    calendar_version_id: "calendar-1", rule_revision_id: "revision-1",
    evidence_state: "verified" as const,
  };
  const timingSources = (overrides: Partial<AdvancedSources> = {}): AdvancedSources => ({
    ...basic,
    items: [item("i1")],
    operations: [],
    timingRules: [{
      id: "rule-1", scope: "PRODUCTION", stalled_limit_minutes: 180,
      calendar_version_id: "calendar-1", calendar_verified: true,
      revision: 1, updated_at: "2026-11-02T10:00:00.000Z",
    }],
    timingEvidenceAvailable: true,
    stageIntervals: [interval],
    stagePauses: [],
    calendars: [{
      id: "calendar-1", version: 1, time_zone: "America/Sao_Paulo",
      effective_from: "2026-11-01", effective_until: null,
    }],
    calendarPeriods: [{
      id: "period-1", calendar_version_id: "calendar-1", weekday: 1,
      starts_local: "08:00:00", ends_local: "12:00:00",
    }],
    calendarExceptions: [],
    ...overrides,
  });

  it("converts the published local work window to elapsed minutes", () => {
    const sources = timingSources();
    expect(calculateWorkingMinutes(
      interval.entered_at, now.toISOString(), sources.calendars[0],
      sources.calendarPeriods, sources.calendarExceptions,
    )).toBe(240);
    const result = buildAdvancedAssessments([order()], sources, now)[0];
    expect(result.timing).toBe("available");
    expect(result.elapsedWorkingMinutes).toBe(240);
    expect(result.limitMinutes).toBe(180);
    expect(result.overLimit).toBe(true);
    expect(result.timingReason).toContain("não comprova sozinho a causa");
  });

  it("does not calculate when temporal evidence tables are unavailable", () => {
    const sources = timingSources({ timingEvidenceAvailable: false });
    const result = buildAdvancedAssessments([order()], sources, now)[0];
    expect(result.timing).toBe("unavailable");
    expect(result.elapsedWorkingMinutes).toBeNull();
  });

  it("subtracts the union of verified pauses without double counting overlaps", () => {
    const sources = timingSources({
      operations: [
        operation("op-1", "i1", { created_at: "2026-11-02T11:30:00.000Z" }),
        operation("op-2", "i1", { created_at: "2026-11-02T11:30:00.000Z" }),
      ],
      stagePauses: [
        { id: "pause-1", stage_interval_id: "interval-1", operation_id: "op-1",
          started_at: "2026-11-02T12:00:00.000Z", ended_at: "2026-11-02T13:00:00.000Z",
          reason: "Aguardando liberação", evidence_state: "verified" },
        { id: "pause-2", stage_interval_id: "interval-1", operation_id: "op-2",
          started_at: "2026-11-02T12:30:00.000Z", ended_at: "2026-11-02T13:30:00.000Z",
          reason: "Aguardando material", evidence_state: "verified" },
      ],
    });
    const result = buildAdvancedAssessments([order()], sources, now)[0];
    expect(result.timing).toBe("available");
    expect(result.elapsedWorkingMinutes).toBe(150);
    expect(result.overLimit).toBe(false);
  });

  it("lets a date exception override the weekly schedule", () => {
    const sources = timingSources({
      calendarExceptions: [{
        id: "exception-1", calendar_version_id: "calendar-1", exception_date: "2026-11-02",
        working: false, starts_local: null, ends_local: null,
      }],
    });
    expect(calculateWorkingMinutes(
      interval.entered_at, now.toISOString(), sources.calendars[0],
      sources.calendarPeriods, sources.calendarExceptions,
    )).toBe(0);
  });

  it("does not calculate from unverified baselines or a rule revised after entry", () => {
    const unverified = timingSources({
      stageIntervals: [{ ...interval, evidence_state: "unverified" }],
    });
    expect(buildAdvancedAssessments([order()], unverified, now)[0].timing).toBe("insufficient");

    const revised = timingSources({
      timingRules: [{
        id: "rule-1", scope: "PRODUCTION", stalled_limit_minutes: 180,
        calendar_version_id: "calendar-1", calendar_verified: true,
        revision: 2, updated_at: "2026-11-02T12:00:00.000Z",
      }],
    });
    expect(buildAdvancedAssessments([order()], revised, now)[0].timing).toBe("insufficient");
  });

  it("refuses timing when activity history predates collection or BLOCKED has no pause", () => {
    const oldOperation = timingSources({
      operations: [operation("op-1", "i1", { created_at: "2026-11-02T10:00:00.000Z" })],
    });
    expect(buildAdvancedAssessments([order()], oldOperation, now)[0].timing).toBe("insufficient");

    const missingPause = timingSources({
      operations: [operation("op-1", "i1", {
        status: "BLOCKED", created_at: "2026-11-02T11:30:00.000Z",
      })],
    });
    expect(buildAdvancedAssessments([order()], missingPause, now)[0].timing).toBe("insufficient");
  });

  it("refuses incomplete pause evidence and calendar coverage gaps", () => {
    const unverifiedPause = timingSources({
      operations: [operation("op-1", "i1", { created_at: "2026-11-02T11:30:00.000Z" })],
      stagePauses: [{
        id: "pause-1", stage_interval_id: "interval-1", operation_id: "op-1",
        started_at: "2026-11-02T12:00:00.000Z", ended_at: "2026-11-02T13:00:00.000Z",
        reason: "Marco incompleto", evidence_state: "unverified",
      }],
    });
    expect(buildAdvancedAssessments([order()], unverifiedPause, now)[0].timing).toBe("insufficient");

    const orphanPause = timingSources({
      stagePauses: [{
        id: "pause-deleted", stage_interval_id: "interval-1", operation_id: null,
        started_at: "2026-11-02T12:00:00.000Z", ended_at: "2026-11-02T13:00:00.000Z",
        reason: "Atividade removida", evidence_state: "verified",
      }],
    });
    expect(buildAdvancedAssessments([order()], orphanPause, now)[0].timing).toBe("insufficient");

    const expiredCalendar = timingSources({
      calendars: [{
        id: "calendar-1", version: 1, time_zone: "America/Sao_Paulo",
        effective_from: "2026-11-01", effective_until: "2026-11-01",
      }],
    });
    expect(buildAdvancedAssessments([order()], expiredCalendar, now)[0].timing).toBe("insufficient");
  });
});
