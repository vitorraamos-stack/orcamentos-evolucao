import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  range: vi.fn(),
  in: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from } }));

import { listDashboardOrders, listDashboardAssignees } from "./dashboardRepository";

function setup() {
  const query = {
    select: vi.fn(), eq: vi.fn(), or: vi.fn(), order: vi.fn(),
    range: mocks.range, in: mocks.in, abortSignal: vi.fn(),
  };
  Object.values(query).forEach(method => method.mockReturnValue(query));
  mocks.from.mockReturnValue(query);
  return query;
}

describe("dashboard repository — consulta read-only e RLS", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the entire permitted result set with deterministic pagination", async () => {
    const query = setup();
    const rows = Array.from({ length: 620 }, (_, i) => ({ id: String(i) }));
    mocks.range
      .mockResolvedValueOnce({ data: rows.slice(0, 500), count: 620, error: null })
      .mockResolvedValueOnce({ data: rows.slice(500), count: 620, error: null });
    const result = await listDashboardOrders();
    expect(result).toHaveLength(620);
    expect(mocks.range).toHaveBeenNthCalledWith(1, 0, 499);
    expect(mocks.range).toHaveBeenNthCalledWith(2, 500, 999);
    expect(query.eq).toHaveBeenCalledWith("archived", false);
    expect(query.or).toHaveBeenCalledWith("prod_status.is.null,prod_status.not.ilike.%finaliz%");
    expect(query.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(query.select).toHaveBeenCalledWith(expect.any(String), { count: "exact" });
    expect(mocks.from).toHaveBeenCalledWith("os_orders");
  });

  it("preserves a confirmed empty count as zero, rather than a loading error", async () => {
    setup();
    mocks.range.mockResolvedValue({ data: [], count: 0, error: null });
    expect(await listDashboardOrders()).toEqual([]);
  });

  it("fails closed if the server does not confirm a total", async () => {
    setup();
    mocks.range.mockResolvedValue({ data: [], count: null, error: null });
    await expect(listDashboardOrders()).rejects.toThrow("contagem");
  });

  it("reconciles once on changing totals, then returns an error", async () => {
    setup();
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: String(i) }));
    mocks.range
      .mockResolvedValueOnce({ data: rows, count: 501, error: null })
      .mockResolvedValueOnce({ data: [], count: 502, error: null })
      .mockResolvedValueOnce({ data: rows, count: 501, error: null })
      .mockResolvedValueOnce({ data: [], count: 502, error: null });
    await expect(listDashboardOrders()).rejects.toThrow("mudaram");
    expect(mocks.range).toHaveBeenCalledTimes(4);
  });

  it("enriches only selected orders with permitted profiles", async () => {
    const query = setup();
    mocks.in.mockResolvedValue({
      data: [{ order_id: "a", scope: "GENERAL", profiles: { email: "responsavel@empresa.com" } }],
      error: null,
    });
    const assignments = await listDashboardAssignees(["a", "b"]);
    expect(mocks.from).toHaveBeenCalledWith("os_order_assignees");
    expect(query.in).toHaveBeenCalledWith("order_id", ["a", "b"]);
    expect(assignments).toEqual([{ order_id: "a", scope: "GENERAL", email: "responsavel@empresa.com" }]);
  });
});
