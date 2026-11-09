import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));
import { loadUserDisplayNamesByIds } from "./userDisplayNamesRepository";

describe("loadUserDisplayNamesByIds", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves registered names for unique IDs and keeps email as identity metadata", async () => {
    rpc.mockResolvedValue({ data: [{ id: "1", full_name: "  Larissa  ", email: "larissa@empresa.com" }], error: null });
    const names = await loadUserDisplayNamesByIds(["1", "1", ""]);
    expect(rpc).toHaveBeenCalledWith("get_user_display_names", { user_ids: ["1"] });
    expect(names.get("1")).toEqual({ id: "1", name: "Larissa", email: "larissa@empresa.com" });
  });

  it("does not call the RPC for empty selections", async () => {
    await expect(loadUserDisplayNamesByIds([])).resolves.toEqual(new Map());
    expect(rpc).not.toHaveBeenCalled();
  });

  it("preserves a fallback for legacy accounts without a registered name", async () => {
    rpc.mockResolvedValue({ data: [{ id: "2", full_name: null, email: "user@empresa.com" }], error: null });
    expect((await loadUserDisplayNamesByIds(["2"])).get("2")?.name).toBe("user@empresa.com");
  });

  it("does not silently ignore errors in the authorized name lookup", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "not authorized" } });
    await expect(loadUserDisplayNamesByIds(["1"])).rejects.toThrow("not authorized");
  });
});
