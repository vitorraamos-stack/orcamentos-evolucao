import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
import { quickFilterOperations } from "./orderRepository";

const now = new Date("2026-09-18T15:00:00Z");

describe("quickFilterOperations", () => {
  it("maps dates to database operations before pagination", () => {
    expect(quickFilterOperations("today", now)).toContainEqual({
      method: "eq",
      column: "delivery_date",
      value: "2026-09-18",
    });
    expect(quickFilterOperations("tomorrow", now)).toContainEqual({
      method: "eq",
      column: "delivery_date",
      value: "2026-09-19",
    });
    expect(quickFilterOperations("week", now)).toEqual([
      { method: "gte", column: "delivery_date", value: "2026-09-18" },
      { method: "lte", column: "delivery_date", value: "2026-09-25" },
    ]);
  });

  it("centralizes active, finished, overdue, urgent and pending clauses", () => {
    expect(quickFilterOperations("active", now)).toHaveLength(2);
    expect(quickFilterOperations("finished", now)[0]).toMatchObject({
      method: "or",
    });
    expect(quickFilterOperations("overdue", now)).toContainEqual({
      method: "lt",
      column: "delivery_date",
      value: "2026-09-18",
    });
    expect(quickFilterOperations("urgent", now)).toContainEqual({
      method: "eq",
      column: "art_direction_tag",
      value: "URGENTE",
    });
    expect(quickFilterOperations("pending", now)[0]).toMatchObject({
      method: "or",
    });
  });
});
