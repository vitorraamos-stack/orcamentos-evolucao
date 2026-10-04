import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ client: null as any }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => state.client }));
import handler from "./product-engineering";

const response = () => {
  const res: any = { statusCode: 0, payload: null };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body: any) => {
    res.payload = body;
    return res;
  });
  return res;
};
const client = (user: any, role: string | null, authError: any = null) => ({
  auth: { getUser: vi.fn(async () => ({ data: { user }, error: authError })) },
  from: vi.fn((table: string) =>
    table === "profiles"
      ? {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: role ? { role } : null,
                error: null,
              }),
            }),
          }),
        }
      : { select: () => ({ order: async () => ({ data: [], error: null }) }) }
  ),
  rpc: vi.fn(),
});
describe("Product Engineering API authorization", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-secret";
  });
  it("returns 401 without bearer", async () => {
    state.client = client(null, null);
    const res = response();
    await handler({ method: "GET", headers: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(state.client.auth.getUser).not.toHaveBeenCalled();
  });
  it("returns 401 for an invalid bearer", async () => {
    state.client = client(null, null, new Error("bad"));
    const res = response();
    await handler(
      { method: "GET", headers: { authorization: "Bearer bad" } },
      res
    );
    expect(res.statusCode).toBe(401);
  });
  it("returns 403 for a consultant profile", async () => {
    state.client = client({ id: "user" }, "consultor");
    const res = response();
    await handler(
      { method: "GET", headers: { authorization: "Bearer valid" } },
      res
    );
    expect(res.statusCode).toBe(403);
  });
  it.each(["gerente", "admin"])("allows manager role %s", async role => {
    state.client = client(
      { id: "user", user_metadata: { role: "gerente" } },
      role
    );
    const res = response();
    await handler(
      { method: "GET", headers: { authorization: "Bearer valid" }, query: {} },
      res
    );
    expect(res.statusCode).toBe(200);
  });
});
