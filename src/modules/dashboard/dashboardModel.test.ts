import { describe, expect, it } from "vitest";
import type { DashboardOrder } from "./dashboardModel";
import { buildDashboardOverview, dashboardPriorityReason } from "./dashboardModel";

const now = new Date("2026-11-05T15:00:00Z");
const base: DashboardOrder = {
  id: "os-1", sale_number: "501", client_name: "Cliente", title: "Placa",
  delivery_date: "2026-11-15", updated_at: "2026-11-05T11:00:00Z",
  prod_status: "Produção", art_status: "Produzir", production_tag: "EM_PRODUCAO",
  logistic_type: "retirada", archived: false, is_urgent: false, art_direction_tag: null,
};
const row = (id: string, change: Partial<DashboardOrder> = {}): DashboardOrder =>
  ({ ...base, id, sale_number: id, ...change });

describe("Dashboard operacional — indicadores e prioridades", () => {
  it("deduplicates IDs and overlapping reasons without inflating indicators", () => {
    const overdue = row("late", { delivery_date: "2026-11-04", is_urgent: true });
    const today = row("today", { delivery_date: "2026-11-05" });
    const blocked = row("blocked", { delivery_date: null, production_tag: "AGUARDANDO_INSUMOS" });
    const noDate = row("missing", { delivery_date: null, updated_at: "2026-11-05T12:00:00Z" });
    const closed = row("closed", { prod_status: "Finalizados", delivery_date: "2026-11-01" });
    const value = buildDashboardOverview([overdue, overdue, today, blocked, noDate, closed], now);
    expect(value).toMatchObject({ active: 4, attention: 3, overdue: 1, dueToday: 1 });
    expect(value.priorities.map(item => item.order.id)).toEqual(["late", "blocked", "today"]);
    expect(value.priorities.find(item => item.order.id === "blocked")?.reason).toBe("Aguardando insumos");
    expect(value.priorities.find(item => item.order.id === "missing")).toBeUndefined();
  });

  it("uses earliest deadline to break equal severity and limits priorities to five", () => {
    const rows = Array.from({ length: 7 }, (_, i) =>
      row(String(i), { is_urgent: true, delivery_date: "2026-11-" + String(12 - i).padStart(2, "0") }));
    const value = buildDashboardOverview(rows, now);
    expect(value.priorities).toHaveLength(5);
    expect(value.priorities.map(x => x.order.id)).toEqual(["6", "5", "4", "3", "2"]);
  });

  it("does not consider an absent deadline late", () => {
    expect(dashboardPriorityReason(row("n", { delivery_date: null, updated_at: "2026-11-05T12:00:00Z" }), now).rank).toBe(7);
  });

  it("counts real parallel sector signals separately without duplicating active OS", () => {
    const value = buildDashboardOverview([
      row("parallel", { art_status: "Em Criação", prod_status: "Produção" }),
      row("logistic", { prod_status: "Instalação Agendada", production_tag: null }),
      row("finish", { prod_status: "Em Acabamento", production_tag: null }),
    ], now);
    expect(value.active).toBe(3);
    expect(value.sectors).toEqual({ artwork: 1, production: 1, finishing: 1, logistics: 1 });
  });

  it("uses São Paulo/Santa Catarina calendar dates regardless of host UTC day", () => {
    const midnight = new Date("2026-11-06T01:00:00Z"); // 05/11, 22:00 in SC
    expect(buildDashboardOverview([row("x", { delivery_date: "2026-11-05" })], midnight).dueToday).toBe(1);
  });

  it("keeps distant OS outside the priorities and attention count", () => {
    const reference = new Date("2026-11-11T14:00:00Z");
    const fresh = "2026-11-11T13:00:00Z";
    const value = buildDashboardOverview([
      row("39833", { delivery_date: "2026-12-15", updated_at: fresh }),
      row("39834", { delivery_date: "2026-12-15", updated_at: fresh }),
      row("no-date", { delivery_date: null, updated_at: fresh }),
    ], reference);
    expect(value).toMatchObject({ active: 3, attention: 0, overdue: 0, dueToday: 0 });
    expect(value.priorities).toEqual([]);
    expect(dashboardPriorityReason(row("39833", { delivery_date: "2026-12-15", updated_at: fresh }), reference).reason).toBe("Dentro do prazo");
  });

  it("labels one, two and three remaining business days without weekend false alerts", () => {
    const friday = new Date("2026-11-13T14:00:00Z");
    const fresh = "2026-11-13T13:00:00Z";
    expect(dashboardPriorityReason(row("critical", { delivery_date: "2026-11-16", updated_at: fresh }), friday).reason).toBe("Prazo crítico");
    expect(dashboardPriorityReason(row("two", { delivery_date: "2026-11-17", updated_at: fresh }), friday).reason).toBe("Próximo prazo");
    expect(dashboardPriorityReason(row("three", { delivery_date: "2026-11-18", updated_at: fresh }), friday).reason).toBe("Próximo prazo");
    const healthy = dashboardPriorityReason(row("four", { delivery_date: "2026-11-19", updated_at: fresh }), friday);
    expect(healthy.reason).toBe("Dentro do prazo");
    expect(healthy.rank).toBe(7);
  });

  it("keeps urgency, blocking and inactivity as independent reasons for attention", () => {
    const reference = new Date("2026-11-13T14:00:00Z");
    const updated_at = "2026-11-13T13:00:00Z";
    const value = buildDashboardOverview([
      row("normal", { delivery_date: "2026-12-15", updated_at }),
      row("urgent", { delivery_date: "2026-12-15", updated_at, is_urgent: true }),
      row("blocked", { delivery_date: "2026-12-15", updated_at, production_tag: "AGUARDANDO_INSUMOS" }),
      row("stale", { delivery_date: "2026-12-15", updated_at: "2026-11-07T13:00:00Z" }),
    ], reference);
    expect(value.attention).toBe(3);
    expect(value.priorities.map(item => item.order.id)).toEqual(["blocked", "urgent", "stale"]);
    expect(value.priorities.find(item => item.order.id === "stale")?.reason).toBe("Sem atualização há 4+ dias");
  });
});
