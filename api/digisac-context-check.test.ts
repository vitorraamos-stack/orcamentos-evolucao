import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./digisac-context-check";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), profile: vi.fn(), access: vi.fn(),
  getContact: vi.fn(), getTicket: vi.fn(), getUser: vi.fn(),
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
  return { ...actual, digisacReadClientFromEnv: () => ({
    getContact: mocks.getContact, getTicket: mocks.getTicket, getUser: mocks.getUser,
  }) };
});
const refs = { contactId: "c-1", ticketId: "t-1", userId: "u-1" };
async function invoke(body: unknown = refs, authorization = "Bearer fixture", method = "POST") {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ method, headers: { authorization }, body }, res);
  return { status: res.status.mock.calls[0][0], payload: res.json.mock.calls[0][0] };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SUPABASE_URL", "https://example.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-key");
  mocks.auth.mockResolvedValue({ data: { user: { id: "manager-fixture", email: "private@example.invalid", email_confirmed_at: "fixture-date" } }, error: null });
  mocks.profile.mockResolvedValue({ data: { role: "gerente" }, error: null });
  mocks.access.mockResolvedValue({ data: true, error: null });
  mocks.getContact.mockResolvedValue({ id: "c-1", name: "PRIVATE_NAME", data: { number: "PRIVATE_PHONE" } });
  mocks.getTicket.mockResolvedValue({ id: "t-1", contactId: "c-1", userId: "u-1", isOpen: true });
  mocks.getUser.mockResolvedValue({ id: "u-1", email: "private@example.invalid" });
});
afterEach(() => vi.unstubAllEnvs());

describe("manager-only Digisac context check", () => {
  it("returns minimized checks only, not raw data or identifiers", async () => {
    const result = await invoke();
    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({ ok: true, code: "CONTEXT_INSPECTED", checks: { ticketContact: true, ticketAssignee: true, accountEmail: true } });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|example.invalid|c-1|t-1|u-1/);
    expect(mocks.getContact).toHaveBeenCalledWith("c-1");
    expect(mocks.getTicket).toHaveBeenCalledWith("t-1");
  });
  it("rejects unauthenticated and non-manager calls before touching Digisac", async () => {
    expect((await invoke(refs, "")).status).toBe(401);
    expect((await invoke(refs, "Bearer fixture", "GET")).status).toBe(405);
    mocks.profile.mockResolvedValue({ data: { role: "consultor_vendas" }, error: null });
    expect((await invoke()).status).toBe(403);
    mocks.profile.mockResolvedValue({ data: { role: "gerente" }, error: null });
    mocks.access.mockResolvedValue({ data: false, error: null });
    expect((await invoke()).status).toBe(403);
    expect(mocks.getContact).not.toHaveBeenCalled();
    expect(mocks.getTicket).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("rejects arbitrary fields and invalid references", async () => {
    expect((await invoke({ ...refs, userId: "../users" })).status).toBe(400);
    expect((await invoke({ ...refs, role: "gerente" })).status).toBe(400);
    expect(mocks.getContact).not.toHaveBeenCalled();
  });
});
