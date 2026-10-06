import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ client: null as any }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => state.client }));
import handler from "../../api/pricing";

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = "2026-10-06T12:00:00Z";

const response = () => {
  const res: any = { statusCode: 0, payload: null };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body: unknown) => {
    res.payload = body;
    return res;
  });
  return res;
};

const client = (user: any, role: string | null, authError: unknown = null) => ({
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
      : {}
  ),
  rpc: vi.fn(async (name: string) => {
    if (name === "pricing_get_policy_secure")
      return {
        data: {
          id: id(1),
          code: "STANDARD",
          name: "Standard",
          description: null,
          status: "ACTIVE",
          revision: 1,
          created_at: now,
          created_by: id(9),
          updated_at: now,
          updated_by: id(9),
        },
        error: null,
      };
    if (name === "pricing_create_policy_secure")
      return {
        data: {
          policy_id: id(1),
          version_id: id(2),
          policy_revision: 1,
          version_revision: 1,
        },
        error: null,
      };
    return { data: null, error: null };
  }),
});

describe("Pricing API manager authority", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-secret";
  });

  it("returns 401 without bearer or with an invalid token", async () => {
    state.client = client(null, null);
    let res = response();
    await handler(
      { method: "GET", headers: {}, query: { policyId: id(1) } },
      res
    );
    expect(res.statusCode).toBe(401);
    expect(state.client.auth.getUser).not.toHaveBeenCalled();

    state.client = client(null, null, new Error("bad token"));
    res = response();
    await handler(
      {
        method: "GET",
        headers: { authorization: "Bearer bad" },
        query: { policyId: id(1) },
      },
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it("does not trust user metadata and rejects consultants", async () => {
    state.client = client(
      { id: id(9), user_metadata: { role: "gerente" } },
      "consultor_vendas"
    );
    const res = response();
    await handler(
      {
        method: "GET",
        headers: { authorization: "Bearer valid" },
        query: { policyId: id(1) },
      },
      res
    );
    expect(res.statusCode).toBe(403);
    expect(state.client.rpc).not.toHaveBeenCalled();
  });

  it.each(["gerente", "admin"])(
    "allows the manager-compatible role %s",
    async role => {
      state.client = client({ id: id(9) }, role);
      const res = response();
      await handler(
        {
          method: "GET",
          headers: { authorization: "Bearer valid" },
          query: { policyId: id(1) },
        },
        res
      );
      expect(res.statusCode).toBe(200);
      expect(res.payload.data).toMatchObject({
        id: id(1),
        code: "STANDARD",
        revision: 1,
      });
    }
  );

  it("rejects unknown, empty, or ambiguous administration queries", async () => {
    for (const query of [
      {},
      { unknown: "x" },
      { policyId: id(1), productId: id(2) },
      { installments: "0" },
      { installments: "13" },
    ]) {
      state.client = client({ id: id(9) }, "gerente");
      const res = response();
      await handler(
        {
          method: "GET",
          headers: { authorization: "Bearer valid" },
          query,
        },
        res
      );
      expect(res.statusCode).toBe(400);
      expect(res.payload.error.code).toBe("INVALID_QUERY");
      expect(state.client.rpc).not.toHaveBeenCalled();
    }
  });

  it("rejects browser-supplied actor and publication metadata", async () => {
    state.client = client({ id: id(9) }, "gerente");
    const res = response();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer valid" },
        body: {
          action: "PUBLISH_VERSION",
          versionId: id(2),
          expectedRevision: 1,
          actorId: id(8),
          publishedBy: id(8),
          publishedAt: now,
        },
      },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.payload.error.code).toBe("INVALID_PAYLOAD");
    expect(state.client.rpc).not.toHaveBeenCalled();
  });

  it("rejects financial JS numbers from the browser", async () => {
    state.client = client({ id: id(9) }, "gerente");
    const res = response();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer valid" },
        body: {
          action: "SET_PAYMENT_TERM",
          installments: 6,
          rate: 0.05,
          expectedRevision: null,
        },
      },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(state.client.rpc).not.toHaveBeenCalled();
  });

  it("derives the mutation actor from the authenticated user", async () => {
    const actor = id(9);
    state.client = client({ id: actor }, "gerente");
    const res = response();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer valid" },
        body: {
          action: "CREATE_POLICY",
          policy: {
            code: "STANDARD",
            name: "Standard",
            status: "ACTIVE",
          },
          markup: "1",
        },
      },
      res
    );
    expect(res.statusCode).toBe(200);
    expect(state.client.rpc).toHaveBeenCalledWith(
      "pricing_create_policy_secure",
      expect.objectContaining({
        p_actor_id: actor,
        p_markup: "1",
      })
    );
    expect(res.payload.data).toMatchObject({
      policyId: id(1),
      versionId: id(2),
    });
  });
});
