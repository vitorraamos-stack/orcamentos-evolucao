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

import { loadHubUsersByIds, loadHubUsersByRoles } from "./hubUsersRepository";

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

describe("loadHubUsersByIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: [], error: null });
  });

  it("returns immediately without querying profiles or the RPC for empty ids", async () => {
    await expect(loadHubUsersByIds([])).resolves.toEqual([]);

    expect(mocks.profiles).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses the RPC full name and preserves the profile role", async () => {
    mocks.profiles.mockResolvedValue({
      data: [{ id: "1", email: "joao@empresa.com", role: "instalador" }],
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: [
        {
          id: "1",
          full_name: "João",
          email: "joao@empresa.com",
        },
      ],
      error: null,
    });

    await expect(loadHubUsersByIds(["1"])).resolves.toEqual([
      {
        id: "1",
        name: "João",
        email: "joao@empresa.com",
        role: "instalador",
      },
    ]);
  });

  it("falls back to the email when the RPC full name is null", async () => {
    mocks.profiles.mockResolvedValue({
      data: [{ id: "1", email: "joao@empresa.com", role: "instalador" }],
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: [{ id: "1", full_name: null, email: "joao@empresa.com" }],
      error: null,
    });

    const [user] = await loadHubUsersByIds(["1"]);

    expect(user.name).toBe("joao@empresa.com");
  });

  it("queries only unique, non-empty ids", async () => {
    mocks.profiles.mockResolvedValue({ data: [], error: null });

    await loadHubUsersByIds(["1", "", "1", "2"]);

    expect(mocks.profiles).toHaveBeenCalledOnce();
    expect(mocks.profiles).toHaveBeenCalledWith("id", ["1", "2"]);
  });

  it("propagates display-name RPC errors", async () => {
    mocks.profiles.mockResolvedValue({
      data: [{ id: "1", email: "joao@empresa.com", role: "instalador" }],
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "not authorized" },
    });

    await expect(loadHubUsersByIds(["1"])).rejects.toThrow("not authorized");
  });
});
