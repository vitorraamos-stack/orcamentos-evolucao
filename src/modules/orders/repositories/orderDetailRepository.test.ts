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
  it("normalizes optional item fields and validates measures", () => {
    const result = itemInputSchema.parse({ name: "Fachada", description: "", notes: "", quantity: "2", width_cm: "240", height_cm: "120", unit: "un", status: "IN_PROGRESS", sort_order: 0 });
    expect(result).toMatchObject({ description: null, notes: null, quantity: 2, width_cm: 240, height_cm: 120 });
    expect(itemInputSchema.safeParse({ ...result, width_cm: 0 }).success).toBe(false);
    expect(itemInputSchema.safeParse({ ...result, status: "UNKNOWN" }).success).toBe(false);
  });
});
