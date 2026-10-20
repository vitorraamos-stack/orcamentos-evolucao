import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  client: null as any,
  load: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => state.client }));
vi.mock("./_shared/product-commercial-adapter/service.js", () => ({
  PublishedCommercialAdapterService: class {
    load(productId: string) { return state.load(productId); }
  },
  PublishedCommercialAdapterError: class extends Error {
    constructor(readonly status: number, readonly code: string, message: string) {
      super(message);
    }
  },
}));
import handler from "./product-commercial-adapter";

const PRODUCT = "10000000-0000-4000-8000-000000000001";
const ACTOR = "10000000-0000-4000-8000-000000000003";
function reply() {
  const res: any = { statusCode: 0, payload: null };
  res.status = (n: number) => { res.statusCode = n; return res; };
  res.json = (value: unknown) => { res.payload = value; return res; };
  return res;
}
const req = (method = "GET", query: unknown = { productId: PRODUCT }) =>
  ({ method, query, headers: { authorization: "Bearer valid" } });

function client(role: string, access = true, user: any = { id: ACTOR }) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({
        maybeSingle: async () => ({ data: { role }, error: null }),
      }) }),
    })),
    rpc: vi.fn(async () => ({ data: access, error: null })),
  };
}

describe("published commercial adapter API", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only";
    state.load.mockReset().mockResolvedValue({ name: "Published" });
    state.client = client("consultor_vendas");
  });

  it("blocks all mutation methods", async () => {
    const res = reply();
    await handler(req("POST"), res);
    expect(res.statusCode).toBe(405);
    expect(state.client.auth.getUser).not.toHaveBeenCalled();
  });

  it("blocks missing bearer and invalid sessions", async () => {
    const res = reply();
    await handler({ method: "GET", headers: {}, query: { productId: PRODUCT } }, res);
    expect(res.statusCode).toBe(401);
    state.client = client("consultor_vendas", true, null);
    const invalid = reply();
    await handler(req(), invalid);
    expect(invalid.statusCode).toBe(401);
  });

  it("denies roles without permission and modules without access", async () => {
    for (const [role, access] of [
      ["producao", true], ["consultor_vendas", false],
    ] as const) {
      state.client = client(role, access);
      const res = reply();
      await handler(req(), res);
      expect(res.statusCode).toBe(403);
    }
    expect(state.load).not.toHaveBeenCalled();
  });

  it.each(["consultor_vendas", "gerente", "admin"])(
    "allows a permitted commercial reader (%s)", async role => {
      state.client = client(role);
      const res = reply();
      await handler(req(), res);
      expect(res.statusCode).toBe(200);
      expect(state.load).toHaveBeenCalledWith(PRODUCT);
    }
  );

  it("rejects invalid UUIDs and unexpected query parameters", async () => {
    const bad = reply();
    await handler(req("GET", { productId: "bad" }), bad);
    expect(bad.statusCode).toBe(400);
    const extra = reply();
    await handler(req("GET", { productId: PRODUCT, draft: true }), extra);
    expect(extra.statusCode).toBe(400);
    expect(state.load).not.toHaveBeenCalled();
  });
});
