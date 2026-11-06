import { describe, expect, it } from "vitest";
import type { DashboardOrder } from "./dashboardModel";
import {
  advancedSummary, analyzeDependencies, assessStageRequirements, buildAdvancedAssessments,
  orderOperationalScope, type AdvancedSources, type OperationDependency, type RuleSource,
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
  updated_at: "2026-11-06T12:00:00Z", ...extra,
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
