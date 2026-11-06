import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { createDashboardDependency, removeDashboardDependency } from "./dashboardDependencyRepository";

describe("Dashboard Etapa 4 — gravação de dependências por RPC gerencial", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a link only through the protected RPC and returns its persisted row", async () => {
    const persisted = {
      id: "link-1", order_id: "order-1",
      predecessor_operation_id: "operation-a",
      successor_operation_id: "operation-b",
    };
    mocks.rpc.mockResolvedValue({ data: persisted, error: null });

    await expect(createDashboardDependency({
      orderId: "order-1",
      predecessorId: "operation-a",
      successorId: "operation-b",
      reason: "Impressão precisa terminar antes da montagem",
    })).resolves.toEqual(persisted);

    expect(mocks.rpc).toHaveBeenCalledWith("dashboard_link_operations", {
      p_order_id: "order-1",
      p_predecessor_id: "operation-a",
      p_successor_id: "operation-b",
      p_reason: "Impressão precisa terminar antes da montagem",
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("surfaces server-side cycle, access and consistency errors", async () => {
    mocks.rpc.mockResolvedValue({
      data: null, error: { message: "Dependência criaria um ciclo" },
    });
    await expect(createDashboardDependency({
      orderId: "order-1", predecessorId: "a", successorId: "b", reason: "Sequência real",
    })).rejects.toThrow("Dependência criaria um ciclo");
  });

  it("removes a link through the audit-preserving RPC with a reason", async () => {
    mocks.rpc.mockResolvedValue({ data: "link-1", error: null });
    await expect(removeDashboardDependency({
      dependencyId: "link-1", reason: "Fluxo operacional foi alterado",
    })).resolves.toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith("dashboard_unlink_operations", {
      p_dependency_id: "link-1",
      p_reason: "Fluxo operacional foi alterado",
    });
  });
});
