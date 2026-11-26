import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./digisac-connection-check";
import { DigisacClientError } from "./_shared/digisac/readClient";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), profile: vi.fn(), access: vi.fn(), check: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: mocks.auth },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
    rpc: mocks.access,
  }),
}));
vi.mock("./_shared/digisac/readClient.js", async importOriginal => {
  const actual = await importOriginal<typeof import("./_shared/digisac/readClient")>();
  return { ...actual, digisacReadClientFromEnv: () => ({ checkConnection: mocks.check }) };
});

async function invoke(method = "POST", authorization = "Bearer fixture-session") {
  const res = {
    setHeader: vi.fn(), status: vi.fn(), json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  await handler({ method, headers: { authorization } }, res);
  return { status: res.status.mock.calls[0][0], payload: res.json.mock.calls[0][0], headers: res.setHeader.mock.calls };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SUPABASE_URL", "https://example.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-server-key");
  mocks.auth.mockResolvedValue({ data: { user: { id: "manager-fixture" } }, error: null });
  mocks.profile.mockResolvedValue({ data: { role: "gerente" }, error: null });
  mocks.access.mockResolvedValue({ data: true, error: null });
  mocks.check.mockResolvedValue({ data: [{ email: "private-fixture", name: "private-fixture" }] });
});
afterEach(() => vi.unstubAllEnvs());

describe("Digisac connection diagnostic", () => {
  it("returns only a status to an authorized manager", async () => {
    const result = await invoke();
    expect(result.status).toBe(200);
    expect(result.payload).toEqual({ ok: true, code: "CONNECTED" });
    expect(result.headers).toContainEqual(["Cache-Control", "private, no-store, max-age=0"]);
    expect(mocks.check).toHaveBeenCalledOnce();
    expect(mocks.access).toHaveBeenCalledWith("has_module_access", { uid: "manager-fixture", module_key: "hub_os" });
  });
  it("rejects GET and missing authentication before contacting the provider", async () => {
    expect((await invoke("GET")).status).toBe(405);
    expect((await invoke("POST", "")).status).toBe(401);
    expect(mocks.check).not.toHaveBeenCalled();
  });
  it("rejects anonymous accounts and invalid sessions", async () => {
    mocks.auth.mockResolvedValue({ data: { user: { id: "anonymous", is_anonymous: true } }, error: null });
    expect((await invoke()).status).toBe(401);
    mocks.auth.mockResolvedValue({ data: { user: null }, error: {} });
    expect((await invoke()).status).toBe(401);
    expect(mocks.check).not.toHaveBeenCalled();
  });
  it("rejects sales users and managers without module access", async () => {
    mocks.profile.mockResolvedValue({ data: { role: "consultor_vendas" }, error: null });
    expect((await invoke()).status).toBe(403);
    mocks.profile.mockResolvedValue({ data: { role: "gerente" }, error: null });
    mocks.access.mockResolvedValue({ data: false, error: null });
    expect((await invoke()).status).toBe(403);
    expect(mocks.check).not.toHaveBeenCalled();
  });
  it("maps invalid configuration and rejected tokens to safe error codes", async () => {
    mocks.check.mockRejectedValueOnce(new DigisacClientError("configuration"));
    expect((await invoke()).payload).toEqual({ ok: false, code: "DIGISAC_CONFIG" });
    mocks.check.mockRejectedValueOnce(new DigisacClientError("unauthorized"));
    expect((await invoke()).payload).toEqual({ ok: false, code: "DIGISAC_UNAUTHORIZED" });
    mocks.check.mockRejectedValueOnce(new Error("private provider response"));
    expect((await invoke()).payload).toEqual({ ok: false, code: "SERVER_UNAVAILABLE" });
  });
});
