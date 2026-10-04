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
  rpc: vi.fn(async () => ({
    data: {
      product_id: "10000000-0000-4000-8000-000000000001",
      version_id: "10000000-0000-4000-8000-000000000002",
      revision: 1,
    },
    error: null,
  })),
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
    state.client = client(
      { id: "user", user_metadata: { role: "gerente" } },
      "consultor_vendas"
    );
    const res = response();
    await handler(
      { method: "GET", headers: { authorization: "Bearer valid" } },
      res
    );
    expect(res.statusCode).toBe(403);
  });
  it("rejects invalid UUID query parameters", async () => {
    state.client = client({ id: "user" }, "gerente");
    const res = response();
    await handler(
      {
        method: "GET",
        headers: { authorization: "Bearer valid" },
        query: { versionId: "bad" },
      },
      res
    );
    expect(res.payload.error.code).toBe("INVALID_QUERY");
  });
  it("rejects browser-supplied actor and publication metadata", async () => {
    state.client = client({ id: "user" }, "gerente");
    const res = response();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer valid" },
        body: {
          action: "PUBLISH_VERSION",
          versionId: "10000000-0000-4000-8000-000000000001",
          expectedRevision: 1,
          actorId: "attacker",
          publishedBy: "attacker",
          publishedAt: "now",
        },
      },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.payload.error.code).toBe("INVALID_PAYLOAD");
    expect(state.client.rpc).not.toHaveBeenCalled();
  });
  it("derives the create actor from the authenticated user", async () => {
    const actor = "10000000-0000-4000-8000-000000000009";
    state.client = client({ id: actor }, "gerente");
    const res = response();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer valid" },
        body: {
          action: "CREATE_PRODUCT",
          product: { code: "TEST", name: "Test" },
        },
      },
      res
    );
    expect(res.statusCode).toBe(200);
    expect(state.client.rpc).toHaveBeenCalledWith(
      "product_engineering_create_product_secure",
      expect.objectContaining({ p_actor_id: actor })
    );
    expect(res.payload.data).toMatchObject({
      productId: "10000000-0000-4000-8000-000000000001",
    });
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
