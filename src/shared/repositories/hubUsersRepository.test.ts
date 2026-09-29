import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profiles: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ in: mocks.profiles })),
    })),
    rpc: mocks.rpc,
  },
}));

import { loadHubUsersByRoles } from "./hubUsersRepository";

describe("loadHubUsersByRoles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: [], error: null });
  });

  it("uses the full name returned by the display-name RPC", async () => {
    mocks.profiles.mockResolvedValue({
      data: [{ id: "1", email: "a@x.com", role: "instalador" }],
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: [{ id: "1", full_name: "João", email: "a@x.com" }],
      error: null,
    });

    await expect(loadHubUsersByRoles(["instalador"])).resolves.toEqual([
      { id: "1", name: "João", email: "a@x.com", role: "instalador" },
    ]);
  });

  it("falls back to email when full_name is null", async () => {
    mocks.profiles.mockResolvedValue({
      data: [{ id: "1", email: "a@x.com", role: "gerente" }],
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: [{ id: "1", full_name: null, email: "a@x.com" }],
      error: null,
    });

    const [user] = await loadHubUsersByRoles(["gerente"]);

    expect(user.name).toBe("a@x.com");
  });

  it("does not call the RPC when profiles is empty", async () => {
    mocks.profiles.mockResolvedValue({ data: [], error: null });

    await expect(loadHubUsersByRoles(["gerente"])).resolves.toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("preserves profile roles, including legacy admin records", async () => {
    mocks.profiles.mockResolvedValue({
      data: [
        { id: "1", email: "manager@x.com", role: "gerente" },
        { id: "2", email: "admin@x.com", role: "admin" },
      ],
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: [
        { id: "1", full_name: "Gerente", email: "manager@x.com" },
        { id: "2", full_name: "Admin", email: "admin@x.com" },
      ],
      error: null,
    });

    const users = await loadHubUsersByRoles(["gerente", "admin"]);

    expect(users.map(user => user.role)).toEqual(["gerente", "admin"]);
    expect(users).toContainEqual({
      id: "2",
      name: "Admin",
      email: "admin@x.com",
      role: "admin",
    });
  });

  it("propagates display-name RPC errors", async () => {
    mocks.profiles.mockResolvedValue({
      data: [{ id: "1", email: "a@x.com", role: "admin" }],
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "not authorized" },
    });

    await expect(loadHubUsersByRoles(["admin"])).rejects.toThrow(
      "not authorized"
    );
  });
});
