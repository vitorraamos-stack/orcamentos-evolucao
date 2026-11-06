import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from } }));

import {
  listDashboardPreparationSources, resolvePreparationOrderByItem,
} from "./dashboardPreparationRepository";

type Row = Record<string, unknown>;
function query(rows: Row[], count: number | null = rows.length) {
  const q = {
    select: vi.fn(), in: vi.fn(), is: vi.fn(),
    order: vi.fn(), range: vi.fn(), eq: vi.fn(),
    maybeSingle: vi.fn(), abortSignal: vi.fn(),
  };
  q.select.mockReturnValue(q);
  q.in.mockReturnValue(q);
  q.is.mockReturnValue(q);
  q.order.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.abortSignal.mockReturnValue(q);
  q.range.mockImplementation(async (from: number, to: number) => ({
    data: rows.slice(from, to + 1), count, error: null,
  }));
  q.maybeSingle.mockResolvedValue({ data: rows[0] ?? null, error: null });
  return q;
}
const makeItem = (id: string) => ({
  id, order_id: "os1", name: "Placa", status: "READY", updated_at: "2026-11-06T12:00:00Z",
});
const makeOperation = (id: string, itemId: string) => ({
  id, item_id: itemId, work_center: "PRINTING", status: "COMPLETED",
  is_required: true, assigned_to: "person", blocked_reason: null, updated_at: "2026-11-06T12:00:00Z",
});

describe("Dashboard Etapa 3 — fontes paginadas e RLS", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never scans any table when there are no visible orders", async () => {
    expect(await listDashboardPreparationSources([])).toEqual({ items: [], operations: [] });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("queries only linked order items then operations and ignores soft deletions", async () => {
    const items = query([makeItem("item1")]);
    const operations = query([makeOperation("op1", "item1")]);
    mocks.from.mockImplementation((name: string) => {
      if (name === "os_order_items") return items;
      if (name === "os_order_item_operations") return operations;
      throw Error("Unexpected table");
    });
    const result = await listDashboardPreparationSources(["os1"]);
    expect(result.items).toHaveLength(1);
    expect(result.operations).toHaveLength(1);
    expect(items.in).toHaveBeenCalledWith("order_id", ["os1"]);
    expect(operations.in).toHaveBeenCalledWith("item_id", ["item1"]);
    expect(items.is).toHaveBeenCalledWith("deleted_at", null);
    expect(operations.is).toHaveBeenCalledWith("deleted_at", null);
    expect(operations.select.mock.calls[0][0]).toContain("created_at");
    expect(mocks.from).not.toHaveBeenCalledWith("materials");
  });

  it("paginates beyond 500 records with stable count and duplicates check", async () => {
    const items = query(Array.from({ length: 501 }, (_, i) => makeItem(String(i))));
    const operations = query([]);
    mocks.from.mockImplementation((name: string) => name === "os_order_items" ? items : operations);
    const result = await listDashboardPreparationSources(["os1"]);
    expect(result.items).toHaveLength(501);
    expect(items.range).toHaveBeenCalledWith(0, 499);
    expect(items.range).toHaveBeenCalledWith(500, 999);
  });

  it("fails closed instead of treating denied/unverifiable count as zero", async () => {
    const items = query([], null);
    mocks.from.mockReturnValue(items);
    await expect(listDashboardPreparationSources(["os1"])).rejects.toThrow("contagem da preparação");
  });

  it("resolves an operation item through RLS before targeted revalidation", async () => {
    const q = query([{ order_id: "os2" }]);
    mocks.from.mockReturnValue(q);
    expect(await resolvePreparationOrderByItem("item2")).toBe("os2");
    expect(q.eq).toHaveBeenCalledWith("id", "item2");
  });

  it("honors cancellation and propagates backend errors", async () => {
    const q = query([]);
    q.range.mockResolvedValue({ data: [], count: 0, error: { message: "Sem acesso" } });
    mocks.from.mockReturnValue(q);
    await expect(listDashboardPreparationSources(["os1"])).rejects.toThrow("Sem acesso");
  });
});
