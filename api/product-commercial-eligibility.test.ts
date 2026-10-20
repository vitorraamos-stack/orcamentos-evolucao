import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ client: null as any, assess: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => state.client }));
vi.mock("./_shared/product-commercial-eligibility/service.js", () => ({
  CommercialEligibilityService: class { assess(x: unknown) { return state.assess(x); } },
  CommercialEligibilityServiceError: class extends Error {
    constructor(readonly status: number, readonly code: string, text: string) {
      super(text);
    }
  },
}));
import handler from "./product-commercial-eligibility";

const p = "10000000-0000-4000-8000-000000000001";
const actor = "10000000-0000-4000-8000-000000000003";
const payload = {
  action: "CHECK_COMMERCIAL_ELIGIBILITY",
  productId: p,
  commercialVersion: 2,
  values: {}, selectedComplementIds: [], photosConfirmed: false,
};
function res() {
  const x: any = { statusCode: null, payload: null };
  x.status = (code: number) => { x.statusCode = code; return x; };
  x.json = (data: unknown) => { x.payload = data; return x; };
  return x;
}
const request = (body: unknown = payload, method = "POST"): any => ({
  method, body, headers: { authorization: "Bearer valid" },
});
function db(role: string, allowed = true) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: actor } }, error: null }) },
    from: () => ({
      select: () => ({ eq: () => ({
        maybeSingle: async () => ({ data: { role }, error: null }),
      }) }),
    }),
    rpc: async () => ({ data: allowed, error: null }),
  };
}
describe("PR 31C endpoint authorization", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "internal-key";
    state.client = db("consultor_vendas");
    state.assess.mockReset().mockResolvedValue({ status: "PREPARATION_ONLY" });
  });

  it("requires bearer and POST method", async () => {
    const noAuth = res();
    await handler({ ...request(), headers: {} }, noAuth);
    expect(noAuth.statusCode).toBe(401);
    const get = res();
    await handler(request(payload, "GET"), get);
    expect(get.statusCode).toBe(405);
  });

  it("denies role and module unauthorized users", async () => {
    for (const [role, allowed] of [
      ["operador", true], ["consultor_vendas", false],
    ] as const) {
      state.client = db(role, allowed);
      const output = res();
      await handler(request(), output);
      expect(output.statusCode).toBe(403);
    }
    expect(state.assess).not.toHaveBeenCalled();
  });

  it("validates strict request and authenticates legitimate consultant", async () => {
    state.client = db("consultor_vendas");
    const invalid = res();
    await handler(request({ ...payload, administrativePrice: 999 }), invalid);
    expect(invalid.statusCode).toBe(400);
    const output = res();
    await handler(request(), output);
    expect(output.statusCode).toBe(200);
    expect(state.assess).toHaveBeenCalledWith({
      productId: p, commercialVersion: 2, values: {},
      selectedComplementIds: [], photosConfirmed: false,
    });
  });
});
