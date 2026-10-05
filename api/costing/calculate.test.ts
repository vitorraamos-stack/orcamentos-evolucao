import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ client: null as any, calculate: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => state.client }));
vi.mock("../_shared/costing/calculationService.js", () => ({
  OfficialCostingCalculationService: class {
    calculate = state.calculate;
  },
  OfficialCostingCompatibilityError: class extends Error {
    code = "INVALID_COSTING_AGGREGATION_INPUT";
  },
}));
import handler from "./calculate.js";

const requestBody = {
  productVersionId: "10000000-0000-4000-8000-000000000001",
  request: { commercialQuantity: "3", technicalInputs: {} },
};
const result = {
  aggregationVersion: "1.0",
  productVersionId: requestBody.productVersionId,
  components: [],
};

const response = () => {
  const res: any = { statusCode: 0, payload: null };
  res.status = vi.fn(
    (statusCode: number) => ((res.statusCode = statusCode), res)
  );
  res.json = vi.fn((payload: unknown) => ((res.payload = payload), res));
  return res;
};
const client = (user: any, role: string | null, authError: unknown = null) => ({
  auth: { getUser: vi.fn(async () => ({ data: { user }, error: authError })) },
  from: vi.fn(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: role ? { role } : null,
          error: null,
        }),
      }),
    }),
  })),
});
const invoke = async (options: Record<string, unknown> = {}) => {
  const res = response();
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer valid" },
      body: requestBody,
      ...options,
    },
    res
  );
  return res;
};

describe("POST /api/costing/calculate", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-secret";
    state.client = client({ id: "actor" }, "gerente");
    state.calculate.mockReset().mockResolvedValue(result);
  });

  it.each(["GET", "PUT", "DELETE"])("rejects %s with 405", async method => {
    const res = await invoke({ method });
    expect(res.statusCode).toBe(405);
    expect(state.client.auth.getUser).not.toHaveBeenCalled();
  });

  it("requires a valid bearer token", async () => {
    let res = await invoke({ headers: {} });
    expect(res.statusCode).toBe(401);
    state.client = client(null, null, new Error("invalid"));
    res = await invoke();
    expect(res.statusCode).toBe(401);
    expect(res.payload.error.code).toBe("UNAUTHENTICATED");
  });

  it.each([
    ["gerente", 200],
    ["admin", 200],
    ["consultor_vendas", 403],
    ["unknown", 403],
  ])("maps role %s to status %i", async (role, status) => {
    state.client = client({ id: "actor" }, role);
    const res = await invoke();
    expect(res.statusCode).toBe(status);
  });

  it("returns exactly the service result in the success envelope", async () => {
    const res = await invoke();
    expect(res.payload).toEqual({ ok: true, data: result });
    expect(state.calculate).toHaveBeenCalledWith(requestBody);
  });

  it.each([
    ["invalid JSON", "{"],
    [
      "an extra effectiveCostAt",
      { ...requestBody, effectiveCostAt: "2026-10-05T12:00:00Z" },
    ],
    ["client resources", { ...requestBody, resources: [] }],
  ])("rejects %s as INVALID_PAYLOAD", async (_label, body) => {
    const res = await invoke({ body });
    expect(res.statusCode).toBe(400);
    expect(res.payload.error.code).toBe("INVALID_PAYLOAD");
    expect(state.calculate).not.toHaveBeenCalled();
  });
});
