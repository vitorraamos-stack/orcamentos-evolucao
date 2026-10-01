import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  eq: vi.fn(),
  or: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from },
}));

import {
  listOperationalOrders,
  listOperationalOrderSummaryRows,
} from "./orderRepository";

describe("order repository pagination stability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes null art direction tags in the Normal priority filter", async () => {
    const query = {
      select: vi.fn(),
      order: mocks.order,
      eq: mocks.eq,
      or: mocks.or,
      range: mocks.range,
    };
    Object.values(query).forEach(mock => mock.mockReturnValue(query));
    mocks.from.mockReturnValue(query);
    mocks.range.mockResolvedValue({ data: [], count: 0, error: null });

    await listOperationalOrders({ page: 1, pageSize: 25, urgent: false });

    expect(mocks.eq).toHaveBeenCalledWith("is_urgent", false);
    expect(mocks.or).toHaveBeenCalledWith(
      "art_direction_tag.is.null,art_direction_tag.neq.URGENTE"
    );
  });

  it("orders every summary batch by id and includes all 1200 rows", async () => {
    const query = {
      select: vi.fn(),
      order: mocks.order,
      range: mocks.range,
    };
    Object.values(query).forEach(mock => mock.mockReturnValue(query));
    mocks.from.mockReturnValue(query);
    const rows = Array.from({ length: 1200 }, (_, index) => ({
      id: String(index).padStart(4, "0"),
    }));
    mocks.range
      .mockResolvedValueOnce({ data: rows.slice(0, 1000), error: null })
      .mockResolvedValueOnce({ data: rows.slice(1000), error: null });

    const result = await listOperationalOrderSummaryRows();

    expect(mocks.order).toHaveBeenNthCalledWith(1, "id", { ascending: true });
    expect(mocks.order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
    expect(mocks.range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(mocks.range).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(result.total).toBe(1200);
    expect(result.orders).toHaveLength(1200);
  });
});
