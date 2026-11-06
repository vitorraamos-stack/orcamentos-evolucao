import { describe, expect, it } from "vitest";
import type { DashboardOrder } from "./dashboardModel";
import type { AgendaEvent } from "./dashboardAgenda";
import {
  assessCommitment, assessOrderPreparation, buildOrderPreparations,
  summarizePreparation, type PreparationItem, type PreparationOperation,
} from "./dashboardPreparation";

const order = (id = "os1", change: Partial<DashboardOrder> = {}): DashboardOrder => ({
  id, sale_number: "501", client_name: "Cliente", title: "Letreiro",
  delivery_date: "2026-11-08", updated_at: "2026-11-06T10:00:00Z",
  prod_status: "Instalação Agendada", art_status: "Produzir",
  production_tag: "PRONTO", logistic_type: "instalacao", archived: false,
  is_urgent: false, art_direction_tag: null, ...change,
});
const item = (id: string, status: PreparationItem["status"], osId = "os1"): PreparationItem => ({
  id, order_id: osId, name: "Item " + id, status, updated_at: "2026-11-06T10:00:00Z",
});
const op = (id: string, itemId: string, changes: Partial<PreparationOperation> = {}): PreparationOperation => ({
  id, item_id: itemId, work_center: "PRINTING", status: "PENDING",
  is_required: true, assigned_to: "person", blocked_reason: null,
  updated_at: "2026-11-06T10:00:00Z", ...changes,
});
const event = (o = order(), changes: Partial<AgendaEvent> = {}): AgendaEvent => ({
  key: "installation:123", kind: "installation", order: o,
  dateKey: "2026-11-06", when: "2026-11-06T15:00:00Z", hasTime: true,
  label: "Instalação", status: "Agendada", warnings: [],
  overdueWithoutCompletion: false, conflict: false, ...changes,
});
const now = new Date("2026-11-06T12:00:00Z");

describe("Dashboard Etapa 3 — preparação sem suposições", () => {
  it("does not certify stock materials based on item READY or production tag PRONTO", () => {
    const result = assessOrderPreparation(order(), [item("i", "READY")], [op("o", "i", { status: "COMPLETED" })]);
    expect(result.production).toBe("ready");
    expect(result.materials).toBe("unverified");
    expect(result.combined).toBe("unverified");
    expect(result.reasons).toContain("Itens de produção prontos; materiais ainda não verificados");
  });

  it("keeps explicit material hold pending even when operations are complete", () => {
    const result = assessOrderPreparation(
      order("os1", { production_tag: "AGUARDANDO_INSUMOS" }),
      [item("i", "READY")],
      [op("o", "i", { status: "COMPLETED" })],
    );
    expect(result.combined).toBe("pending");
    expect(result.materials).toBe("pending");
  });

  it("handles partial work, optional operations, parallel work and required block", () => {
    const result = assessOrderPreparation(order(), [
      item("a", "READY"), item("b", "IN_PROGRESS"), item("c", "CANCELLED"),
    ], [
      op("1", "a", { status: "COMPLETED" }),
      op("2", "b", { status: "IN_PROGRESS", assigned_to: null, work_center: "PRINTING" }),
      op("3", "b", { status: "IN_PROGRESS", work_center: "METALWORK" }),
      op("4", "b", { status: "BLOCKED", work_center: "ASSEMBLY", blocked_reason: "Falta peça" }),
      op("5", "b", { status: "BLOCKED", is_required: false }),
      op("6", "c", { status: "BLOCKED" }),
    ]);
    expect(result.totalItems).toBe(2);
    expect(result.readyItems).toBe(1);
    expect(result.blockedOperations).toBe(1);
    expect(result.unassignedRequiredOperations).toBe(1);
    expect(result.parallelCenters).toBe(3);
    expect(result.production).toBe("pending");
  });

  it("distinguishes partial production from unregistered activities", () => {
    expect(assessOrderPreparation(order(), [item("a", "READY"), item("b", "PENDING")], []).production).toBe("partial");
    expect(assessOrderPreparation(order(), [], []).production).toBe("unverified");
    expect(assessOrderPreparation(order(), [item("c", "CANCELLED")], []).production).toBe("unverified");
  });

  it("emits one principal alert and preserves extra reasons without assuming completion", () => {
    const o = order("os1", { production_tag: "AGUARDANDO_INSUMOS" });
    const assessment = assessOrderPreparation(o, [item("i", "PENDING")], [
      op("a", "i", { status: "BLOCKED", assigned_to: null }),
    ]);
    const result = assessCommitment(event(o, {
      overdueWithoutCompletion: true, conflict: true, warnings: ["Equipe ou responsável não informado"],
    }), assessment, now);
    expect(result.primaryAlert).toBe("Materiais aguardando insumos");
    expect(result.additionalAlerts).toContain("Produção com operação obrigatória bloqueada");
    expect(result.additionalAlerts).toContain("Conflito de agenda registrado");
    expect(result.additionalAlerts).toContain("Horário previsto ultrapassado sem conclusão registrada");
    expect(result.reasons.some(x => x.includes("sem responsável"))).toBe(true);
  });

  it("applies configurable 24/48/72-hour window per commitment", () => {
    const o = order();
    const a = assessOrderPreparation(o, [item("i", "PENDING")], []);
    const scheduled = event(o, { when: "2026-11-08T12:00:00Z", dateKey: "2026-11-08" });
    expect(assessCommitment(scheduled, a, now, 24).nearCommitment).toBe(false);
    expect(assessCommitment(scheduled, a, now, 48).nearCommitment).toBe(true);
    expect(assessCommitment(scheduled, a, now, 72).nearCommitment).toBe(true);
  });

  it("counts one OS once across installation, delivery and deadline events", () => {
    const os = order();
    const rows = buildOrderPreparations([os], { items: [item("i", "READY")], operations: [] });
    const summary = summarizePreparation([
      event(os), event(os, { key: "deadline:os1", kind: "deadline", hasTime: false }),
    ], rows);
    expect(summary).toMatchObject({ orders: 1, unverified: 1, pending: 0, partial: 0 });
  });
});
