import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  client: null as any,
  list: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => state.client }));
vi.mock("./_shared/product-commercial-links/service.js", () => ({
  ProductCommercialLinkService: class {
    list(productId?: string) { return state.list(productId); }
    create(productId: string, libraryProductId: string, actorId: string) {
      return state.create(productId, libraryProductId, actorId);
    }
  },
  ProductCommercialLinkServiceError: class extends Error {
    constructor(readonly status: number, readonly code: string, message: string) {
      super(message);
    }
  },
}));
import handler from "./product-commercial-links";

const ID = "10000000-0000-4000-8000-000000000001";
const LIBRARY = "10000000-0000-4000-8000-000000000002";
const ACTOR = "10000000-0000-4000-8000-000000000003";
const res = () => {
  const value: any = { code: 0, payload: null };
  value.status = (status: number) => { value.code = status; return value; };
  value.json = (payload: unknown) => { value.payload = payload; return value; };
  return value;
};
const request = (method = "GET", body?: unknown, query: unknown = {}) => ({
  method, body, query, headers: { authorization: "Bearer good-token" },
});
function fakeClient(role: string | null, access = true, user: any = { id: ACTOR }) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: role ? { role } : null, error: null }),
        }),
      }),
    })),
    rpc: vi.fn(async () => ({ data: access, error: null })),
  };
}
describe("product commercial links API", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-key";
    state.list.mockReset().mockResolvedValue([]);
    state.create.mockReset().mockResolvedValue({
      created: true, link: { productId: ID, libraryProductId: LIBRARY },
    });
    state.client = fakeClient("gerente");
  });
  it("denies missing authentication", async () => {
    const result = res();
    await handler({ method: "GET", headers: {} }, result);
    expect(result.code).toBe(401);
    expect(state.client.rpc).not.toHaveBeenCalled();
  });
  it("requires both manager role and Biblioteca permission", async () => {
    for (const [role, access] of [["consultor_vendas", true], ["gerente", false]] as const) {
      state.client = fakeClient(role, access);
      const result = res();
      await handler(request(), result);
      expect(result.code).toBe(403);
    }
    expect(state.list).not.toHaveBeenCalled();
  });
  it("rejects browser-supplied actor and invalid UUID", async () => {
    const result = res();
    await handler(request("POST", {
      action: "LINK_PRODUCT", productId: ID, libraryProductId: LIBRARY,
      createdBy: ACTOR,
    }), result);
    expect(result.code).toBe(400);
    expect(state.create).not.toHaveBeenCalled();
    const bad = res();
    await handler(request("GET", undefined, { productId: "not-an-id" }), bad);
    expect(bad.code).toBe(400);
  });
  it("creates the link only with authenticated actor", async () => {
    const result = res();
    await handler(request("POST", {
      action: "LINK_PRODUCT", productId: ID, libraryProductId: LIBRARY,
    }), result);
    expect(result.code).toBe(201);
    expect(state.create).toHaveBeenCalledWith(ID, LIBRARY, ACTOR);
    expect(state.client.rpc).toHaveBeenCalledWith("has_module_access", {
      uid: ACTOR, module_key: "biblioteca_produtos",
    });
  });
  it("permits authorized administrative reads", async () => {
    const result = res();
    await handler(request(), result);
    expect(result.code).toBe(200);
    expect(state.list).toHaveBeenCalledWith(undefined);
  });
});
