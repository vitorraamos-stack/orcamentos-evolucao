import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), preparation: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from } }));
vi.mock("./dashboardPreparationRepository", () => ({
  listDashboardPreparationSources: mocks.preparation,
}));
import {
  isMissingSchema, listDashboardAdvancedSources, listDashboardDependencies, listDashboardOperationalRules,
} from "./dashboardAdvancedRepository";

type Row = Record<string, unknown>;
function query(rows: Row[], count: number | null = rows.length, failure: object | null = null) {
  const q = {
    select: vi.fn(), in: vi.fn(), order: vi.fn(), range: vi.fn(), abortSignal: vi.fn(),
    then: vi.fn(),
  };
  for (const name of ["select", "in", "order", "abortSignal"] as const) q[name].mockReturnValue(q);
  q.range.mockImplementation(async (start: number, end: number) => ({
    data: failure ? null : rows.slice(start, end + 1), count, error: failure,
  }));
  // Supabase select without range is thenable.
  q.then.mockImplementation((resolve: (value: unknown) => void) =>
    Promise.resolve(resolve({ data: failure ? null : rows, error: failure })),
  );
  return q;
}
const byTable = (map: Record<string, ReturnType<typeof query>>) => {
  mocks.from.mockImplementation((name: string) => {
    if (!map[name]) throw Error("Unexpected table: " + name);
    return map[name];
  });
};

describe("Dashboard Etapa 4 — consulta RLS e degradação segura", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.preparation.mockResolvedValue({ items: [], operations: [] });
  });

  it("recognizes missing schema only by explicit Postgres/PostgREST codes", () => {
    expect(isMissingSchema({ code: "42P01" })).toBe(true);
    expect(isMissingSchema({ code: "PGRST205" })).toBe(true);
    expect(isMissingSchema({ code: "42501" })).toBe(false);
    expect(isMissingSchema(new Error("network timeout"))).toBe(false);
  });

  it("reports a missing rule and dependency table as unavailable, not empty", async () => {
    byTable({
      os_order_assignees: query([]),
      os_order_deadlines: query([]),
      os_item_operation_dependencies: query([], 0, { code: "PGRST205", message: "missing relation" }),
      dashboard_operational_rules: query([], 0, { code: "PGRST205", message: "missing relation" }),
    });
    const result = await listDashboardAdvancedSources(["os1"]);
    expect(result.rules.state).toBe("unavailable");
    expect(result.dependencies.state).toBe("unavailable");
    expect(result.assignees).toEqual([]);
    expect(result.deadlines).toEqual([]);
  });

  it("surfaces permission errors instead of hiding them as missing configuration", async () => {
    byTable({
      dashboard_operational_rules: query([], 0, { code: "42501", message: "Not authorized" }),
    });
    await expect(listDashboardOperationalRules()).rejects.toMatchObject({code:"42501"});
  });

  it("uses linked OS IDs, pages beyond 500, and never queries unrelated data", async () => {
    const assignees = query(Array.from({length:501},(_,i)=>({
      id:"a"+i, order_id:"os1", scope:"GENERAL", user_id:"u",
    })));
    const deadlines = query([]);
    const rules = query([]);
    const deps = query([]);
    byTable({
      os_order_assignees: assignees,
      os_order_deadlines: deadlines,
      dashboard_operational_rules: rules,
      os_item_operation_dependencies: deps,
    });
    const value = await listDashboardAdvancedSources(["os1"]);
    expect(value.assignees).toHaveLength(501);
    expect(assignees.in).toHaveBeenCalledWith("order_id", ["os1"]);
    expect(assignees.range).toHaveBeenCalledWith(0,499);
    expect(assignees.range).toHaveBeenCalledWith(500,999);
    expect(mocks.preparation).toHaveBeenCalledWith(["os1"], undefined);
  });

  it("does not transform unknown count into a confirmed empty result", async () => {
    byTable({ os_item_operation_dependencies: query([],null) });
    await expect(listDashboardDependencies(["os1"])).rejects.toThrow("Contagem");
  });

  it("will not assume an empty available dependency table is missing", async () => {
    byTable({ os_item_operation_dependencies: query([]) });
    expect(await listDashboardDependencies(["os1"])).toEqual({ state:"available", links:[] });
  });
});
