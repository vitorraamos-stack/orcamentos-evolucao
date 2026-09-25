import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
import { itemInputSchema, ORDER_ASSET_SELECT, ORDER_DETAIL_SELECT } from "./orderDetailRepository";

describe("order detail query plans", () => {
  it("selects explicit order and asset columns", () => {
    expect(ORDER_DETAIL_SELECT).not.toContain("*");
    expect(ORDER_DETAIL_SELECT).toContain("delivery_date");
    expect(ORDER_ASSET_SELECT).not.toContain("*");
  });
  it("validates item quantities and names", () => {
    expect(itemInputSchema.safeParse({ name: "Fachada", quantity: 1, unit: "un", status: "PENDING", sort_order: 0 }).success).toBe(true);
    expect(itemInputSchema.safeParse({ name: "", quantity: 0, unit: "un", status: "PENDING", sort_order: 0 }).success).toBe(false);
  });
});
