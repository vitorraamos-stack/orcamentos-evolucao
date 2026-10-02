import { describe, expect, it } from "vitest";
import type { LogisticsOrder } from "@/modules/installations/types";
import type { Delivery } from "../types";
import {
  buildCompletedLogistics,
  filterCompletedLogistics,
  getWeekStartKey,
  isDeliveryCompletedToday,
  isDeliveryOverdue,
  isPickupCompletedToday,
  reconcileDeliverySelection,
  sortActiveDeliveries,
  sortPickups,
  sortWaitingOrders,
  summarizeDeliveryWorkspace,
} from "./deliveriesPresentation";

const now = new Date("2026-10-02T15:00:00-03:00");
const order = (
  id: string,
  delivery_date: string | null,
  client_name = id
): LogisticsOrder => ({
  id,
  sale_number: id,
  client_name,
  delivery_date,
  address: null,
  address_lat: null,
  address_lng: null,
  logistic_type: "entrega",
  prod_status: "Pronto / Avisar Cliente",
  archived: false,
  updated_at: "2026-10-01",
});
const delivery = (
  id: string,
  status: Delivery["status"],
  scheduled_at: string | null,
  completed_at: string | null = null
): Delivery => ({
  id,
  os_id: id,
  status,
  scheduled_at,
  completed_at,
  mode: "OWN_DELIVERY",
  assigned_to: null,
  vehicle_label: null,
  carrier_name: null,
  tracking_code: null,
  recipient_name: null,
  notes: null,
  cancelled_at: null,
  cancelled_reason: null,
  order: order(id, null),
});

describe("deliveriesPresentation", () => {
  it("deriva atraso apenas para SCHEDULED com horário passado", () => {
    expect(
      isDeliveryOverdue(
        delivery("past", "SCHEDULED", "2026-10-02T14:00:00-03:00"),
        now
      )
    ).toBe(true);
    expect(
      isDeliveryOverdue(
        delivery("future", "SCHEDULED", "2026-10-02T16:00:00-03:00"),
        now
      )
    ).toBe(false);
    expect(
      isDeliveryOverdue(
        delivery("transit", "IN_TRANSIT", "2026-10-01T14:00:00-03:00"),
        now
      )
    ).toBe(false);
    expect(
      isDeliveryOverdue(
        delivery("done", "COMPLETED", "2026-10-01T14:00:00-03:00"),
        now
      )
    ).toBe(false);
    expect(isDeliveryOverdue(delivery("none", "SCHEDULED", null), now)).toBe(
      false
    );
  });
  it("compara conclusões pelo dia de São Paulo", () => {
    expect(
      isDeliveryCompletedToday(
        delivery("today", "COMPLETED", null, "2026-10-03T01:30:00Z"),
        now
      )
    ).toBe(true);
    expect(
      isDeliveryCompletedToday(
        delivery("yesterday", "COMPLETED", null, "2026-10-02T01:30:00Z"),
        now
      )
    ).toBe(false);
    expect(
      isPickupCompletedToday({ retirado_at: "2026-10-03T01:30:00Z" }, now)
    ).toBe(true);
    expect(
      isPickupCompletedToday({ retirado_at: "2026-10-02T01:30:00Z" }, now)
    ).toBe(false);
  });
  it("resume as cinco métricas", () => {
    const pickups = [order("pickup", null)];
    expect(
      summarizeDeliveryWorkspace(
        {
          waiting: [order("w", null)],
          legacy: [order("l", null)],
          activePickups: pickups,
          deliveries: [
            delivery("transit", "IN_TRANSIT", null),
            delivery("late", "SCHEDULED", "2026-10-01T10:00:00-03:00"),
            delivery("done", "COMPLETED", null, "2026-10-02T10:00:00-03:00"),
          ],
          completedPickups: pickups,
          flowFor: () => ({ retirado_at: "2026-10-02T11:00:00-03:00" }),
        },
        now
      )
    ).toEqual({
      waiting: 2,
      pickup: 1,
      inTransit: 1,
      overdue: 1,
      completedToday: 2,
    });
  });
  it("ordena espera por prazo e sem prazo ao final", () => {
    expect(
      sortWaitingOrders([
        order("none", null),
        order("future", "2026-10-03"),
        order("today", "2026-10-02"),
        order("late", "2026-09-30"),
      ]).map(item => item.id)
    ).toEqual(["late", "today", "future", "none"]);
  });
  it("prioriza retirada não avisada e prazo crítico", () => {
    const items = [
      order("notified", "2026-09-29"),
      order("future", "2026-10-04"),
      order("late", "2026-09-30"),
    ];
    expect(
      sortPickups(items, item =>
        item.id === "notified" ? { avisado_at: "2026-09-29" } : {}
      ).map(item => item.id)
    ).toEqual(["late", "future", "notified"]);
  });
  it("ordena despacho por trânsito, atraso, futuro e sem horário", () => {
    const items = [
      delivery("none", "SCHEDULED", null),
      delivery("future", "SCHEDULED", "2026-10-03T10:00:00-03:00"),
      delivery("late", "SCHEDULED", "2026-10-01T10:00:00-03:00"),
      delivery("transit", "IN_TRANSIT", "2026-10-04T10:00:00-03:00"),
    ];
    expect(sortActiveDeliveries(items, now).map(item => item.id)).toEqual([
      "transit",
      "late",
      "future",
      "none",
    ]);
  });
  it("mistura histórico com o mais recente primeiro", () => {
    const pickup = order("pickup", null);
    expect(
      buildCompletedLogistics(
        [delivery("delivery", "COMPLETED", null, "2026-10-01T10:00:00Z")],
        [pickup],
        () => ({ retirado_at: "2026-10-02T10:00:00Z" })
      ).map(item => item.kind)
    ).toEqual(["pickup", "delivery"]);
  });
  it.each([
    ["2026-10-04", "2026-09-28"],
    ["2026-10-05", "2026-10-05"],
    ["2026-10-06", "2026-10-05"],
    ["2026-10-11", "2026-10-05"],
    ["2026-10-01", "2026-09-28"],
    ["2027-01-01", "2026-12-28"],
  ])("calcula a segunda-feira de %s sem timezone local", (key, expected) => {
    expect(getWeekStartKey(key)).toBe(expected);
  });
  it("filtra a semana por chaves de São Paulo entre segunda e hoje", () => {
    const entries = [
      ["sep-28", "2026-09-28T12:00:00-03:00"],
      ["oct-01", "2026-10-01T12:00:00-03:00"],
      ["oct-04", "2026-10-04T12:00:00-03:00"],
      ["oct-05", "2026-10-05T12:00:00-03:00"],
    ].map(([id, occurredAt]) => ({
      kind: "delivery" as const,
      id,
      occurredAt,
      delivery: delivery(id, "COMPLETED", null, occurredAt),
    }));

    expect(
      filterCompletedLogistics(
        entries,
        "",
        "all",
        "week",
        new Date("2026-10-04T12:00:00-03:00")
      ).map(entry => entry.id)
    ).toEqual(["sep-28", "oct-01", "oct-04"]);
  });
  it("reconcilia seleção", () => {
    expect(reconcileDeliverySelection("b", ["a", "b"])).toBe("b");
    expect(reconcileDeliverySelection("x", ["a", "b"])).toBe("a");
    expect(reconcileDeliverySelection("x", [])).toBeNull();
  });
});
