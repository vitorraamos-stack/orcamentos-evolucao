import { describe, expect, it } from "vitest";
import type { OsOrder } from "@/features/hubos/types";
import {
  filterAwaitingSupplies,
  formatSupplyDeadlineStatus,
  formatWaitingLabel,
  getWaitingDays,
  isAwaitingSupplyDueToday,
  isAwaitingSupplyOverdue,
  reconcileAwaitingSupplySelection,
  sortAwaitingSupplies,
  summarizeAwaitingSupplies,
} from "./awaitingSuppliesPresentation";

const now = new Date("2026-10-02T12:00:00");
const order = (id: string, values: Partial<OsOrder> = {}): OsOrder => ({
  id,
  sale_number: id,
  client_name: `Cliente ${id}`,
  title: "Adesivo",
  description: null,
  delivery_date: "2026-10-10",
  delivery_deadline_preset: null,
  delivery_deadline_started_at: null,
  logistic_type: "retirada",
  address: null,
  production_tag: "AGUARDANDO_INSUMOS",
  insumos_details: "Vinil",
  insumos_return_notes: null,
  insumos_requested_at: "2026-10-01T12:00:00",
  insumos_resolved_at: null,
  insumos_resolved_by: null,
  art_direction_tag: null,
  is_urgent: false,
  art_status: "Produzir",
  prod_status: "Produção",
  reproducao: false,
  letra_caixa: false,
  archived: false,
  archived_at: null,
  archived_by: null,
  created_by: null,
  updated_by: null,
  created_at: "2026-09-01T12:00:00",
  updated_at: "2026-10-01T12:00:00",
  ...values,
});

describe("awaiting supplies summary and filters", () => {
  const values = [
    order("critical-urgent", { delivery_date: "2026-10-01", is_urgent: true }),
    order("critical-legacy", {
      delivery_date: "2026-10-02",
      art_direction_tag: "URGENTE",
    }),
    order("normal", { delivery_date: null }),
  ];

  it("summarizes total, canonical risk, both urgency sources and overdue dates", () => {
    expect(summarizeAwaitingSupplies(values, now)).toEqual({
      total: 3,
      critical: 2,
      urgent: 2,
      overdue: 1,
    });
  });

  it("does not consider today or an absent deadline overdue", () => {
    expect(isAwaitingSupplyOverdue(values[1], now)).toBe(false);
    expect(isAwaitingSupplyDueToday(values[1], now)).toBe(true);
    expect(isAwaitingSupplyOverdue(values[2], now)).toBe(false);
  });

  it.each([
    ["all", ["critical-urgent", "critical-legacy", "normal"]],
    ["critical", ["critical-urgent", "critical-legacy"]],
    ["urgent", ["critical-urgent", "critical-legacy"]],
    ["overdue", ["critical-urgent"]],
  ] as const)("applies the %s filter", (filter, expected) => {
    expect(
      filterAwaitingSupplies(values, filter, now).map(item => item.id)
    ).toEqual(expected);
  });
});

describe("awaiting supplies sorting", () => {
  const values = [
    order("no-deadline", { delivery_date: null, insumos_requested_at: null }),
    order("future", {
      delivery_date: "2026-10-05",
      insumos_requested_at: "2026-09-20T12:00:00",
    }),
    order("today", {
      delivery_date: "2026-10-02",
      prod_status: "Pronto / Avisar Cliente",
      insumos_requested_at: "2026-09-25T12:00:00",
    }),
    order("overdue", {
      delivery_date: "2026-10-01",
      prod_status: "Pronto / Avisar Cliente",
      insumos_requested_at: "2026-09-28T12:00:00",
    }),
    order("urgent", {
      delivery_date: "2026-10-08",
      is_urgent: true,
      insumos_requested_at: "2026-09-29T12:00:00",
    }),
    order("critical", {
      delivery_date: "2026-10-02",
      insumos_requested_at: "2026-09-30T12:00:00",
    }),
  ];

  it("orders priority by critical, urgent, overdue, today, future and no deadline", () => {
    expect(
      sortAwaitingSupplies(values, "priority", now).map(item => item.id)
    ).toEqual([
      "overdue",
      "critical",
      "urgent",
      "today",
      "future",
      "no-deadline",
    ]);
  });

  it("sorts oldest and newest with missing dates last", () => {
    expect(
      sortAwaitingSupplies(values, "oldest", now).map(item => item.id)
    ).toEqual([
      "future",
      "today",
      "overdue",
      "urgent",
      "critical",
      "no-deadline",
    ]);
    expect(
      sortAwaitingSupplies(values, "newest", now).map(item => item.id)
    ).toEqual([
      "critical",
      "urgent",
      "overdue",
      "today",
      "future",
      "no-deadline",
    ]);
  });

  it("sorts deadline, then request time and id deterministically", () => {
    const tie = [order("b"), order("a"), ...values];
    expect(
      sortAwaitingSupplies(tie, "deadline", now).map(item => item.id)
    ).toEqual([
      "overdue",
      "today",
      "critical",
      "future",
      "urgent",
      "a",
      "b",
      "no-deadline",
    ]);
  });
});

describe("awaiting supplies date labels", () => {
  it.each([
    [null, "Sem prazo"],
    ["2026-10-01", "Prazo vencido há 1 dia"],
    ["2026-09-29", "Prazo vencido há 3 dias"],
    ["2026-10-02", "Prazo hoje"],
    ["2026-10-03", "Prazo amanhã"],
    ["2026-10-07", "Prazo em 5 dias"],
  ])("formats deadline %s", (deliveryDate, label) => {
    expect(
      formatSupplyDeadlineStatus(
        order("x", { delivery_date: deliveryDate }),
        now
      )
    ).toBe(label);
  });

  it.each([
    [null, null, "Solicitação sem data"],
    ["2026-10-02T08:00:00", 0, "Aguardando desde hoje"],
    ["2026-10-01T08:00:00", 1, "Aguardando há 1 dia"],
    ["2026-09-29T08:00:00", 3, "Aguardando há 3 dias"],
  ])("formats waiting time %s", (requestedAt, days, label) => {
    const value = order("x", { insumos_requested_at: requestedAt });
    expect(getWaitingDays(value, now)).toBe(days);
    expect(formatWaitingLabel(value, now)).toBe(label);
  });
});

describe("reconcileAwaitingSupplySelection", () => {
  it("keeps a visible selection", () =>
    expect(reconcileAwaitingSupplySelection("b", ["a", "b"])).toBe("b"));
  it("selects the first visible order when the current one disappears", () =>
    expect(reconcileAwaitingSupplySelection("b", ["a", "c"])).toBe("a"));
  it("clears selection for an empty list", () =>
    expect(reconcileAwaitingSupplySelection("b", [])).toBeNull());
});
