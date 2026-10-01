import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
import {
  AWAITING_SUPPLIES_SELECT,
  sortAwaitingSuppliesOrders,
} from "./suppliesRepository";

describe("suppliesRepository", () => {
  it("selects canonical supplies fields and sorts without losing records", () => {
    expect(AWAITING_SUPPLIES_SELECT).toContain("insumos_details");
    expect(AWAITING_SUPPLIES_SELECT).toContain("insumos_requested_at");
    const base: any = {
      prod_status: "Produção",
      archived: false,
      updated_at: "2026-01-01",
      logistic_type: "retirada",
      delivery_date: "2026-12-01",
      insumos_requested_at: "2026-01-01",
    };
    const sorted = sortAwaitingSuppliesOrders([
      { ...base, id: "normal", is_urgent: false },
      { ...base, id: "urgent", is_urgent: true },
    ]);
    expect(sorted.map(item => item.id)).toEqual(["urgent", "normal"]);
  });
});
