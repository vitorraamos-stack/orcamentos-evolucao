import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  range: vi.fn(),
  in: vi.fn(),
  abortSignal: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from } }));
import { listOperationalOrders } from "./orderRepository";

const fixture = (n: number) => ({
  id: String(n).padStart(3, "0"),
  delivery_date: "2026-11-30",
  updated_at: "2026-10-26T09:00:00Z",
  prod_status: "Produção",
  logistic_type: "retirada",
  archived: false,
  is_urgent: false,
  art_direction_tag: null,
});

describe("return location within permitted filtered rows", () => {
  beforeEach(() => vi.clearAllMocks());
  const build = (rows: ReturnType<typeof fixture>[]) => {
    const query = {
      select: vi.fn(), order: vi.fn(), eq: vi.fn(), or: vi.fn(),
      range: mocks.range, in: mocks.in, abortSignal: mocks.abortSignal,
    };
    Object.values(query).forEach(fn => fn.mockReturnValue(query));
    mocks.from.mockReturnValue(query);
    mocks.range.mockResolvedValue({ data: rows, count: rows.length, error: null });
    mocks.in.mockImplementation((_column: string, ids: string[]) => {
      const response = { data: rows.filter(row => ids.includes(row.id)), error: null };
      // PostgREST builders are thenable and expose abortSignal before awaiting.
      // Preserve both behaviors in the test double.
      return Object.assign(Promise.resolve(response), {
        abortSignal: (signal: AbortSignal) => {
          mocks.abortSignal(signal);
          return Promise.resolve(response);
        },
      });
    });
  };

  it("locates an OS on its newly ordered page, before paging", async () => {
    const rows = Array.from({length: 68}, (_,i) => fixture(i));
    build(rows);
    const result = await listOperationalOrders({
      page: 1, pageSize: 25, locateOrderId: "058",
      now: new Date("2026-10-26T12:00:00Z"),
    });
    expect(result.page).toBe(3);
    expect(result.locatedOrderId).toBe("058");
    expect(result.orders.map(row => row.id)).toContain("058");
    expect(result.orders).toHaveLength(18);
  });

  it("does not widen filters when the OS is not in the authorized query", async () => {
    const rows = Array.from({length: 32}, (_,i) => fixture(i));
    build(rows);
    const result = await listOperationalOrders({
      page: 1, pageSize: 25, locateOrderId: "secret-order",
      now: new Date("2026-10-26T12:00:00Z"),
    });
    expect(result.page).toBe(1);
    expect(result.locatedOrderId).toBeNull();
    expect(mocks.in).toHaveBeenCalledTimes(1);
    expect(result.orders).toHaveLength(25);
  });

  it("passes a cancellation signal to both ranking and detail reads", async () => {
    build([fixture(0)]);
    const controller = new AbortController();
    const result = await listOperationalOrders({
      page: 1, pageSize: 25, locateOrderId: "000",
      signal: controller.signal,
    });
    expect(result.locatedOrderId).toBe("000");
    expect(mocks.abortSignal).toHaveBeenCalledTimes(2);
    expect(mocks.abortSignal).toHaveBeenCalledWith(controller.signal);
  });
});
