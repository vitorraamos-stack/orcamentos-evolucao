import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
import { BOARD_REALTIME_TABLES } from "./useBoardRealtime";

describe("operational board realtime", () => {
  it("subscribes to order and relation changes shown by cards", () => {
    expect(BOARD_REALTIME_TABLES).toEqual([
      "os_orders",
      "os_order_assignees",
      "os_order_items",
      "os_order_deadlines",
      "os_order_comments",
    ]);
  });
});
