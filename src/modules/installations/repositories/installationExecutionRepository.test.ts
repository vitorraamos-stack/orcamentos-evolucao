import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  loadHubUsersByIds: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from },
}));

vi.mock("@/shared/repositories/hubUsersRepository", () => ({
  loadHubUsersByIds: mocks.loadHubUsersByIds,
}));

import { loadInstallationExecution } from "./installationExecutionRepository";

function queryResult(data: unknown) {
  const result = Promise.resolve({ data, error: null });
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(() => result),
    maybeSingle: vi.fn(() => result),
    order: vi.fn(() => result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe("loadInstallationExecution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadHubUsersByIds.mockResolvedValue([]);
  });

  it("resolves the responsible through loadHubUsersByIds without querying profiles", async () => {
    const responsible = {
      id: "user-1",
      name: "João",
      email: "joao@empresa.com",
      role: "instalador",
    };
    mocks.loadHubUsersByIds.mockResolvedValue([responsible]);
    mocks.from.mockImplementation((table: string) =>
      queryResult(
        table === "os_installations"
          ? {
              id: "installation-1",
              os_id: "order-1",
              team_id: null,
              responsible_id: "user-1",
            }
          : []
      )
    );

    const result = await loadInstallationExecution("installation-1");

    expect(mocks.loadHubUsersByIds).toHaveBeenCalledWith(["user-1"]);
    expect(mocks.from).not.toHaveBeenCalledWith("profiles");
    expect(result.installation.responsible).toEqual(responsible);
  });

  it("returns a null responsible without an invalid profile query", async () => {
    mocks.from.mockImplementation((table: string) =>
      queryResult(
        table === "os_installations"
          ? {
              id: "installation-1",
              os_id: "order-1",
              team_id: null,
              responsible_id: null,
            }
          : []
      )
    );

    const result = await loadInstallationExecution("installation-1");

    expect(mocks.loadHubUsersByIds).toHaveBeenCalledWith([]);
    expect(mocks.from).not.toHaveBeenCalledWith("profiles");
    expect(result.installation.responsible).toBeNull();
  });
});
