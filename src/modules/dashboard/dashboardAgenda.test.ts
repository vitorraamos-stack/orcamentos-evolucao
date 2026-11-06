import { describe, expect, it } from "vitest";
import type { DashboardOrder } from "./dashboardModel";
import {
  buildDashboardAgenda, filterDashboardAgenda, findInstallationConflicts,
  type DashboardInstallation, type DashboardDelivery,
} from "./dashboardAgenda";

const now = new Date("2026-11-05T15:00:00Z");
const order = (id: string, changes: Partial<DashboardOrder> = {}): DashboardOrder => ({
  id, sale_number: id, client_name: "Cliente " + id, title: "Letreiro",
  delivery_date: "2026-11-06", updated_at: "2026-11-05T10:00:00Z",
  art_status: "Produzir", prod_status: "Pronto / Avisar Cliente",
  production_tag: null, logistic_type: "instalacao", archived: false,
  is_urgent: false, art_direction_tag: null, ...changes,
});
const installation = (id: string, os_id: string, changes: Partial<DashboardInstallation> = {}): DashboardInstallation => ({
  id, os_id, team_id: "equipe-1", responsible_id: null,
  status: "SCHEDULED", scheduled_start: "2026-11-05T16:00:00Z",
  scheduled_end: "2026-11-05T18:00:00Z", estimated_duration_minutes: null,
  address_snapshot: "Rua A", ...changes,
});
const delivery = (id: string, os_id: string, changes: Partial<DashboardDelivery> = {}): DashboardDelivery => ({
  id, os_id, mode: "OWN_DELIVERY", status: "SCHEDULED",
  scheduled_at: "2026-11-06T12:00:00Z", assigned_to: "p1", ...changes,
});
const sources = (installations: DashboardInstallation[], deliveries: DashboardDelivery[] = []) => ({
  installations, deliveries, canViewInstallations: true, canViewDeliveries: true,
});

describe("Dashboard Etapa 2 — agenda e conflitos", () => {
  it("integrates installations, deliveries and date-only deadlines without inventing times", () => {
    const o = [order("i"), order("d", { logistic_type: "entrega" })];
    const result = buildDashboardAgenda(o, sources([installation("a", "i")], [delivery("b", "d")]), now);
    expect(result.events.map(e => e.key)).toEqual([
      "installation:a", "delivery:b", "deadline:d", "deadline:i",
    ]);
    expect(result.events.filter(e => e.kind === "deadline").every(e => !e.hasTime)).toBe(true);
    expect(result.events.find(e => e.kind === "installation")?.status).toBe("Agendada");
    expect(result.waitingInstallations).toBe(0);
    expect(result.waitingDeliveries).toBe(0);
  });

  it("ignores cancelled and completed records, handles unplanned logistics without fictitious dates", () => {
    const orders = [order("a"), order("b", { logistic_type: "entrega" }), order("c", { logistic_type: "entrega", archived: true })];
    const agenda = buildDashboardAgenda(orders, sources([
      installation("old", "a", { status: "CANCELLED" }),
    ], [
      delivery("missing", "b", { scheduled_at: null }),
      delivery("finished", "c", { status: "COMPLETED" }),
    ]), now);
    expect(agenda.waitingInstallations).toBe(1);
    expect(agenda.waitingDeliveries).toBe(0);
    expect(agenda.events.some(e => e.key.includes("old") || e.key.includes("missing"))).toBe(false);
    expect(agenda.events.every(e => e.order.id !== "c")).toBe(true);
  });

  it("flags documented overlap by team or responsible but not unknown durations or touching intervals", () => {
    const rows = [
      installation("a", "oa"),
      installation("b", "ob", { scheduled_start: "2026-11-05T17:30:00Z", scheduled_end: "2026-11-05T19:00:00Z" }),
      installation("c", "oc", { scheduled_start: "2026-11-05T18:00:00Z", scheduled_end: "2026-11-05T19:00:00Z", team_id: "other" }),
      installation("d", "od", { scheduled_start: "2026-11-05T16:30:00Z", scheduled_end: null, estimated_duration_minutes: null }),
      installation("e", "oe", { scheduled_start: "2026-11-05T17:00:00Z", scheduled_end: null, estimated_duration_minutes: 45, team_id: "other" }),
    ];
    expect([...findInstallationConflicts(rows)].sort()).toEqual(["a", "b"]);
  });

  it("warns on past appointments without presuming that the work was done", () => {
    const agenda = buildDashboardAgenda([order("a")], sources([
      installation("late", "a", { scheduled_start: "2026-11-05T11:00:00Z" }),
    ]), now);
    expect(agenda.overdueWithoutCompletion).toBe(1);
    expect(agenda.events.find(e => e.kind === "installation")?.warnings).toContain(
      "Horário previsto passou; conclusão não registrada"
    );
    expect(filterDashboardAgenda(agenda, "week", "late", now).map(e => e.key)).toEqual(["installation:late"]);
  });

  it("filters only agenda by São Paulo day and the inclusive seven-day window", () => {
    const localNow = new Date("2026-11-06T01:00:00Z"); // 05/11 22h local
    const orders = [
      order("today", { delivery_date: "2026-11-05" }),
      order("last", { delivery_date: "2026-11-11" }),
      order("outside", { delivery_date: "2026-11-12" }),
    ];
    const agenda = buildDashboardAgenda(orders, sources([]), localNow);
    expect(filterDashboardAgenda(agenda, "today", "all", localNow).map(e => e.order.id)).toEqual(["today"]);
    expect(filterDashboardAgenda(agenda, "week", "all", localNow).map(e => e.order.id)).toEqual(["today", "last"]);
  });

  it("does not leak restricted logistic counts or fabricate events from inaccessible tables", () => {
    const agenda = buildDashboardAgenda([order("private")], {
      installations: [installation("x", "private")],
      deliveries: [],
      canViewInstallations: false, canViewDeliveries: false,
    }, now);
    expect(agenda.waitingInstallations).toBeNull();
    expect(agenda.waitingDeliveries).toBeNull();
    expect(agenda.events.some(e => e.kind === "installation")).toBe(false);
  });
});
