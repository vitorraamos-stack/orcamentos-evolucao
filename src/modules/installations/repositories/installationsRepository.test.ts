import { describe, expect, it, vi } from "vitest";

const installationRows = [
  {
    id: "completed",
    os_id: "os-completed",
    team_id: null,
    responsible_id: null,
    status: "COMPLETED",
  },
  {
    id: "cancelled",
    os_id: "os-cancelled",
    team_id: null,
    responsible_id: null,
    status: "CANCELLED",
  },
];
const operationalOrders = [{ id: "os-waiting", sale_number: "1" }];
const historicalOrders = [
  { id: "os-completed", sale_number: "84756", client_name: "Vitor Teste 003" },
  {
    id: "os-cancelled",
    sale_number: "84757",
    client_name: "Cliente cancelado",
  },
];
const ordersQueries: any[] = [];
const result = (data: any[]) => {
  const query: any = Promise.resolve({ data, error: null });
  for (const method of ["select", "order", "limit", "eq"])
    query[method] = vi.fn(() => query);
  query.in = vi.fn((column: string) => {
    if (column === "id")
      return Promise.resolve({ data: historicalOrders, error: null });
    return query;
  });
  return query;
};
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "os_installations") return result(installationRows);
      if (table === "os_orders") {
        const query = result(operationalOrders);
        ordersQueries.push(query);
        return query;
      }
      return result([]);
    }),
  },
}));
vi.mock("@/shared/repositories/hubUsersRepository", () => ({
  loadHubUsersByRoles: vi.fn(async () => []),
}));
import { loadInstallationWorkspace } from "./installationsRepository";

describe("loadInstallationWorkspace", () => {
  it("batch-enriches completed and cancelled installations independently from the waiting queue", async () => {
    const workspace = await loadInstallationWorkspace();
    expect(workspace.installations.map(row => row.order?.sale_number)).toEqual([
      "84756",
      "84757",
    ]);
    expect(
      ordersQueries.some(query =>
        query.in.mock.calls.some(
          (call: any[]) => call[0] === "id" && call[1].length === 2
        )
      )
    ).toBe(true);
  });
});
