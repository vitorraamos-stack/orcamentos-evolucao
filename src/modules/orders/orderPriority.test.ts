import { describe, expect, it } from "vitest";
import type { OrderPriorityRow } from "./orderPriority";
import { sortOperationalOrderPriority } from "./orderPriority";

const now = new Date("2026-10-26T12:00:00Z");
const base = {
  id: "a",
  delivery_date: null,
  updated_at: "2026-10-24T10:00:00Z",
  prod_status: "Produção",
  logistic_type: "retirada",
  archived: false,
  is_urgent: false,
  art_direction_tag: null,
} satisfies OrderPriorityRow;

describe("global operational priority", () => {
  it("sorts by existing risk classification and urgency before the date", () => {
    const list = [
      { ...base, id: "normal", delivery_date: "2026-11-10" },
      { ...base, id: "attention", delivery_date: "2026-10-28" },
      { ...base, id: "critical", delivery_date: "2026-10-25" },
      { ...base, id: "urgent", delivery_date: "2026-10-28", is_urgent: true },
    ];
    expect(sortOperationalOrderPriority(list, now).map(row => row.id))
      .toEqual(["critical", "urgent", "attention", "normal"]);
  });

  it("does not rank a finalized order above an active order", () => {
    expect(sortOperationalOrderPriority([
      { ...base, id: "finished", archived: true, is_urgent: true, delivery_date: "2026-01-01" },
      { ...base, id: "active", delivery_date: "2026-11-10" },
    ], now).map(row => row.id)).toEqual(["active", "finished"]);
  });

  it("uses stable id tie-breakers and leaves caller data unchanged", () => {
    const list = [{ ...base, id: "z" }, { ...base, id: "a" }];
    expect(sortOperationalOrderPriority(list, now).map(row => row.id)).toEqual(["a", "z"]);
    expect(list.map(row => row.id)).toEqual(["z", "a"]);
  });
});
