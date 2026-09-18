import { describe, expect, it } from "vitest";
import { matchesQuickFilter } from "./orderFilters";
import type { OsOrder } from "@/features/hubos/types";

const order = {
  delivery_date: "2026-09-18",
  prod_status: "Produção",
  archived: false,
} as OsOrder;

describe("matchesQuickFilter", () => {
  it("filters operational deadlines and final status", () => {
    const now = new Date("2026-09-18T10:00:00");
    expect(matchesQuickFilter(order, "today", now)).toBe(true);
    expect(matchesQuickFilter(order, "active", now)).toBe(true);
    expect(
      matchesQuickFilter(
        { ...order, prod_status: "Finalizados" },
        "finished",
        now
      )
    ).toBe(true);
  });
});
