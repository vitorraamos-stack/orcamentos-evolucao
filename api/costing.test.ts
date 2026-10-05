import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ client: null as any }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => state.client }));
import handler from "./costing.js";

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

describe("Costing API manager authority", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-secret";
  });
  it("returns 401 without bearer or with an invalid token", async () => {
    state.client = client(null, null);
    let res = response();
    await handler(
      { method: "GET", headers: {}, query: { type: "MATERIAL" } },
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
        query: { type: "MATERIAL" },
      },
      res
    );
    expect(res.statusCode).toBe(401);
  });
  it("returns 403 for every non-manager profile", async () => {
    state.client = client({ id: "user" }, "consultor_vendas");
    const res = response();
    await handler(
      {
        method: "GET",
        headers: { authorization: "Bearer valid" },
        query: { type: "MATERIAL" },
      },
      res
    );
    expect(res.statusCode).toBe(403);
  });
  it.each(["gerente", "admin"])(
    "allows the manager-compatible role %s",
    async role => {
      state.client = client({ id: "user" }, role);
      const res = response();
      await handler(
        {
          method: "GET",
          headers: { authorization: "Bearer valid" },
          query: { type: "MATERIAL" },
        },
        res
      );
      expect(res.statusCode).toBe(200);
    }
  );
  it("rejects unknown administrative query keys", async () => {
    state.client = client({ id: "user" }, "gerente");
    const res = response();
    await handler(
      {
        method: "GET",
        headers: { authorization: "Bearer valid" },
        query: { type: "MATERIAL", effectiveCostAt: "2026-01-01T00:00:00Z" },
      },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.payload.error.code).toBe("INVALID_QUERY");
  });
});
