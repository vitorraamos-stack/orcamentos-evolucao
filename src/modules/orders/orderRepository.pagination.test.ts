import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  eq: vi.fn(),
  or: vi.fn(),
  in: vi.fn(),
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


  it("repositions an expired page using the exact filtered total", async () => {
    const rows = Array.from({ length: 48 }, (_, index) => ({
      id: String(index).padStart(3, "0"),
      delivery_date: "2026-11-30",
      updated_at: "2026-10-26T09:00:00Z",
      prod_status: "Produção",
      logistic_type: "retirada",
      archived: false,
      is_urgent: false,
      art_direction_tag: null,
    }));
    const query = {
      select: vi.fn(),
      order: mocks.order,
      eq: mocks.eq,
      or: mocks.or,
      in: mocks.in,
      range: mocks.range,
    };
    Object.values(query).forEach(mock => mock.mockReturnValue(query));
    mocks.from.mockReturnValue(query);
    mocks.range.mockResolvedValue({ data: rows, count: 48, error: null });
    mocks.in.mockResolvedValue({ data: rows.slice(25), error: null });

    const result = await listOperationalOrders({
      page: 3,
      pageSize: 25,
      now: new Date("2026-10-26T12:00:00Z"),
    });

    expect(result.page).toBe(2);
    expect(result.total).toBe(48);
    expect(result.orders).toHaveLength(23);
    expect(result.orders[0].id).toBe("025");
    expect(mocks.range).toHaveBeenCalledWith(0, 499);
    expect(mocks.in).toHaveBeenCalledWith("id", rows.slice(25).map(row => row.id));
  });

  it("separates a confirmed empty result from a missing page", async () => {
    const query = {
      select: vi.fn(),
      order: mocks.order,
      eq: mocks.eq,
      or: mocks.or,
      in: mocks.in,
      range: mocks.range,
    };
    Object.values(query).forEach(mock => mock.mockReturnValue(query));
    mocks.from.mockReturnValue(query);
    mocks.range.mockResolvedValue({ data: [], count: 0, error: null });

    const result = await listOperationalOrders({ page: 4, pageSize: 25 });
    expect(result).toMatchObject({ orders: [], total: 0, page: 1 });
    expect(mocks.in).not.toHaveBeenCalled();
  });

  it("rejects uncertain totals rather than inventing zero", async () => {
    const query = {
      select: vi.fn(),
      order: mocks.order,
      eq: mocks.eq,
      or: mocks.or,
      in: mocks.in,
      range: mocks.range,
    };
    Object.values(query).forEach(mock => mock.mockReturnValue(query));
    mocks.from.mockReturnValue(query);
    mocks.range.mockResolvedValue({ data: [], count: null, error: null });
    await expect(listOperationalOrders({ page: 1, pageSize: 25 }))
      .rejects.toThrow("Não foi possível confirmar a contagem");
  });

  it("revalidates one changing snapshot at most once", async () => {
    const rows = Array.from({ length: 500 }, (_, index) => ({
      id: String(index).padStart(3, "0"),
      delivery_date: null,
      updated_at: "2026-10-26T09:00:00Z",
      prod_status: "Produção",
      logistic_type: "retirada",
      archived: false,
      is_urgent: false,
      art_direction_tag: null,
    }));
    const query = {
      select: vi.fn(),
      order: mocks.order,
      eq: mocks.eq,
      or: mocks.or,
      in: mocks.in,
      range: mocks.range,
    };
    Object.values(query).forEach(mock => mock.mockReturnValue(query));
    mocks.from.mockReturnValue(query);
    mocks.range
      .mockResolvedValueOnce({ data: rows, count: 501, error: null })
      .mockResolvedValueOnce({ data: [rows[0]], count: 502, error: null })
      .mockResolvedValueOnce({ data: rows, count: 501, error: null })
      .mockResolvedValueOnce({ data: [rows[0]], count: 502, error: null });
    await expect(listOperationalOrders({ page: 1, pageSize: 25 }))
      .rejects.toThrow("mudou durante a paginação");
    expect(mocks.range).toHaveBeenCalledTimes(4);
    expect(mocks.in).not.toHaveBeenCalled();
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
