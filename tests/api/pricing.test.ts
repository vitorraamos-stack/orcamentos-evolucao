import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  client: null as any,
  officialCalculate: vi.fn(),
  officialQuoteCalculate: vi.fn(),
  officialQuoteSave: vi.fn(),
  officialQuoteLoad: vi.fn(),
  officialQuoteTransition: vi.fn(),
  officialQuoteFormLoad: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => state.client }));
vi.mock("../../api/_shared/pricing/calculationService.js", () => ({
  OfficialPricingCalculationError: class OfficialPricingCalculationError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  OfficialPricingCalculationService: class OfficialPricingCalculationService {
    async calculate(input: unknown) {
      return state.officialCalculate(input);
    }
  },
}));
vi.mock("../../api/_shared/quotes/calculationService.js", () => ({
  OfficialQuoteCalculationError: class OfficialQuoteCalculationError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  OfficialQuoteCalculationService: class OfficialQuoteCalculationService {
    async calculate(input: unknown) {
      return state.officialQuoteCalculate(input);
    }
  },
}));
vi.mock("../../api/_shared/quotes/formService.js", () => ({
  QuoteFormServiceError: class QuoteFormServiceError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  OfficialQuoteFormService: class OfficialQuoteFormService {
    async load() {
      return state.officialQuoteFormLoad();
    }
  },
}));
vi.mock("../../api/_shared/quotes/persistenceService.js", () => ({
  QuotePersistenceServiceError: class QuotePersistenceServiceError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  OfficialQuotePersistenceService: class OfficialQuotePersistenceService {
    async save(input: unknown, actorId: string, isManager: boolean) {
      return state.officialQuoteSave(input, actorId, isManager);
    }
    async load(input: unknown, actorId: string, isManager: boolean) {
      return state.officialQuoteLoad(input, actorId, isManager);
    }
    async transition(input: unknown, actorId: string, isManager: boolean) {
      return state.officialQuoteTransition(input, actorId, isManager);
    }
  },
}));
import { CostingDomainError } from "../../shared/costing/index.js";
import { CostingServiceError } from "../../api/_shared/costing/service.js";
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
    if (name === "pricing_get_official_calculation_context_secure")
      return {
        data: {
          policy: {
            id: id(1),
            code: "STANDARD",
            name: "Standard",
            description: null,
            status: "ACTIVE",
          },
          version: {
            id: id(2),
            pricing_policy_id: id(1),
            version_number: 1,
            revision: 1,
            status: "PUBLISHED",
            notes: null,
            created_at: now,
            created_by: id(9),
            published_at: now,
            published_by: id(9),
          },
          schema_version: "1.0",
          engine_version: "1.0",
          strategy_type: "MARKUP_ON_COST",
          markup: "2",
          markup_base: "TOTAL_COST",
          charges: [],
          product_settings: {
            product_id: id(4),
            pricing_policy_id: id(1),
            minimum_selling_price: "700",
            revision: 1,
            updated_at: now,
            updated_by: id(9),
          },
          payment_term: {
            source: "SYSTEM_ZERO",
            installments: 1,
            rate: "0",
            revision: null,
          },
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
    state.officialCalculate.mockReset();
    state.officialQuoteCalculate.mockReset();
    state.officialQuoteSave.mockReset();
    state.officialQuoteLoad.mockReset();
    state.officialQuoteTransition.mockReset();
    state.officialQuoteFormLoad.mockReset();
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

  it("loads the official manager context for a configured product", async () => {
    state.client = client({ id: id(9) }, "gerente");
    const res = response();

    await handler(
      {
        method: "GET",
        headers: { authorization: "Bearer valid" },
        query: { contextProductId: id(4) },
      },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.payload.data).toMatchObject({
      productSettings: {
        productId: id(4),
        pricingPolicyId: id(1),
        minimumSellingPrice: "700",
      },
      policy: { id: id(1), code: "STANDARD" },
      definition: {
        version: { id: id(2), status: "PUBLISHED" },
        strategy: { type: "MARKUP_ON_COST", markup: "2" },
      },
      payment: { installments: 1, rate: "0", source: "SYSTEM_ZERO" },
    });
    expect(state.client.rpc).toHaveBeenCalledWith(
      "pricing_get_official_calculation_context_secure",
      { p_product_id: id(4), p_installments: 1 }
    );
  });

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


  it.each(["consultor_vendas", "consultor", "gerente", "admin"])(
    "allows %s to request sanitized official Pricing",
    async role => {
      const publicResult = {
        calculationVersion: "1.0",
        productId: id(4),
        productVersionId: id(5),
        productVersionNumber: 2,
        productVersionRevision: 3,
        commercialQuantity: "1",
        installments: 3,
        roundingRule: "BRL_2DP_HALF_UP_V1",
        totalSellingPrice: { currency: "BRL", amount: "250.00" },
      };
      state.officialCalculate.mockResolvedValueOnce({ publicResult });
      state.client = client({ id: id(9) }, role);
      const res = response();

      await handler(
        {
          method: "POST",
          headers: { authorization: "Bearer valid" },
          body: {
            action: "CALCULATE",
            productVersionId: id(5),
            request: { commercialQuantity: "1", technicalInputs: {} },
            installments: 3,
          },
        },
        res
      );

      expect(res.statusCode).toBe(200);
      expect(res.payload).toEqual({ ok: true, data: publicResult });
      expect(state.officialCalculate).toHaveBeenCalledWith({
        productVersionId: id(5),
        request: { commercialQuantity: "1", technicalInputs: {} },
        installments: 3,
      });
      expect(res.payload.data).not.toHaveProperty("totalCost");
      expect(res.payload.data).not.toHaveProperty("markup");
      expect(res.payload.data).not.toHaveProperty("financialRate");
    }
  );

  it.each(["consultor_vendas", "consultor", "gerente", "admin"])(
    "allows %s to load the official Quote form",
    async role => {
      const form = {
        products: [
          {
            productId: id(4),
            code: "LETREIRO_PVC",
            name: "Letreiro em PVC",
            productVersionId: id(5),
            productVersionNumber: 2,
            inputs: [],
            installationAvailable: true,
          },
        ],
        availableInstallments: [1, 2, 3],
      };
      state.officialQuoteFormLoad.mockResolvedValueOnce(form);
      state.client = client({ id: id(9) }, role);
      const res = response();

      await handler(
        {
          method: "POST",
          headers: { authorization: "Bearer valid" },
          body: { action: "GET_QUOTE_FORM" },
        },
        res
      );

      expect(res.statusCode).toBe(200);
      expect(res.payload).toEqual({ ok: true, data: form });
      expect(state.officialQuoteFormLoad).toHaveBeenCalledTimes(1);
    }
  );

  it.each(["arte_finalista", "producao", "instalador"])(
    "rejects role %s from the official Quote form",
    async role => {
      state.client = client({ id: id(9) }, role);
      const res = response();

      await handler(
        {
          method: "POST",
          headers: { authorization: "Bearer valid" },
          body: { action: "GET_QUOTE_FORM" },
        },
        res
      );

      expect(res.statusCode).toBe(403);
      expect(state.officialQuoteFormLoad).not.toHaveBeenCalled();
    }
  );

  it.each(["consultor_vendas", "consultor", "gerente", "admin"])(
    "allows %s to request a sanitized official Quote",
    async role => {
      const publicResult = {
        calculationVersion: "1.0",
        productId: id(4),
        productVersionId: id(5),
        productVersionNumber: 2,
        productVersionRevision: 2,
        commercialQuantity: "1",
        installments: 3,
        productSellingPrice: { currency: "BRL", amount: "720" },
        installation: {
          requested: true,
          areaM2: "1",
          tier: "TIER_1",
          price: { currency: "BRL", amount: "150" },
        },
        munck: {
          requested: false,
          requestedHours: null,
          billedHours: null,
          price: { currency: "BRL", amount: "0" },
        },
        subtotalBeforeFinancialRate: { currency: "BRL", amount: "870" },
        roundingRule: "BRL_2DP_HALF_UP_V1",
        totalSellingPrice: { currency: "BRL", amount: "870.00" },
      };
      state.officialQuoteCalculate.mockResolvedValueOnce({ publicResult });
      state.client = client({ id: id(9) }, role);
      const res = response();

      await handler(
        {
          method: "POST",
          headers: { authorization: "Bearer valid" },
          body: {
            action: "CALCULATE_QUOTE",
            productVersionId: id(5),
            request: {
              commercialQuantity: "1",
              technicalInputs: {
                width: { kind: "decimal", value: "1", unit: "m" },
                height: { kind: "decimal", value: "1", unit: "m" },
              },
            },
            installments: 3,
            installation: { requested: true },
            munck: { requested: false },
          },
        },
        res
      );

      expect(res.statusCode).toBe(200);
      expect(res.payload).toEqual({ ok: true, data: publicResult });
      expect(state.officialQuoteCalculate).toHaveBeenCalledWith({
        productVersionId: id(5),
        request: {
          commercialQuantity: "1",
          technicalInputs: {
            width: { kind: "decimal", value: "1", unit: "m" },
            height: { kind: "decimal", value: "1", unit: "m" },
          },
        },
        installments: 3,
        installation: { requested: true },
        munck: { requested: false },
      });
      expect(res.payload.data).not.toHaveProperty("totalCost");
      expect(res.payload.data).not.toHaveProperty("markup");
      expect(res.payload.data).not.toHaveProperty("financialRate");
    }
  );

  it("rejects browser-supplied Quote prices", async () => {
    state.client = client({ id: id(9) }, "consultor_vendas");
    const res = response();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer valid" },
        body: {
          action: "CALCULATE_QUOTE",
          productVersionId: id(5),
          request: { commercialQuantity: "1", technicalInputs: {} },
          installments: 3,
          installation: { requested: false },
          munck: { requested: false },
          installationPrice: "1",
        },
      },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(state.officialQuoteCalculate).not.toHaveBeenCalled();
  });

  it.each(["consultor_vendas", "consultor", "gerente", "admin"])(
    "allows %s to persist an official Quote snapshot",
    async role => {
      const saved = {
        quoteId: id(10),
        quoteNumber: 1001,
        status: "DRAFT",
        revision: 1,
        snapshotId: id(11),
        snapshotVersion: 1,
        savedAt: now,
        publicResult: {
          calculationVersion: "1.0",
          productId: id(4),
          productVersionId: id(5),
          productVersionNumber: 2,
          productVersionRevision: 2,
          commercialQuantity: "1",
          installments: 3,
          productSellingPrice: { currency: "BRL", amount: "720" },
          installation: {
            requested: false,
            areaM2: null,
            tier: null,
            price: { currency: "BRL", amount: "0" },
          },
          munck: {
            requested: false,
            requestedHours: null,
            billedHours: null,
            price: { currency: "BRL", amount: "0" },
          },
          subtotalBeforeFinancialRate: { currency: "BRL", amount: "720" },
          roundingRule: "BRL_2DP_HALF_UP_V1",
          totalSellingPrice: { currency: "BRL", amount: "720.00" },
        },
      };
      state.officialQuoteSave.mockResolvedValueOnce(saved);
      state.client = client({ id: id(9) }, role);
      const res = response();
      const request = {
        quoteId: null,
        expectedRevision: null,
        productVersionId: id(5),
        request: { commercialQuantity: "1", technicalInputs: {} },
        installments: 3,
        installation: { requested: false },
        munck: { requested: false },
      };

      await handler(
        {
          method: "POST",
          headers: { authorization: "Bearer valid" },
          body: { action: "SAVE_QUOTE", ...request },
        },
        res
      );

      expect(res.statusCode).toBe(200);
      expect(res.payload).toEqual({ ok: true, data: saved });
      expect(state.officialQuoteSave).toHaveBeenCalledWith(
        request,
        id(9),
        role === "gerente" || role === "admin"
      );
      expect(res.payload.data).not.toHaveProperty("privateSnapshot");
      expect(res.payload.data).not.toHaveProperty("costing");
      expect(res.payload.data).not.toHaveProperty("pricingEngine");
    }
  );

  it("rejects browser-supplied persisted Quote snapshots and prices", async () => {
    state.client = client({ id: id(9) }, "consultor_vendas");
    const res = response();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer valid" },
        body: {
          action: "SAVE_QUOTE",
          quoteId: null,
          expectedRevision: null,
          productVersionId: id(5),
          request: { commercialQuantity: "1", technicalInputs: {} },
          installments: 3,
          installation: { requested: false },
          munck: { requested: false },
          totalSellingPrice: "1",
          privateSnapshot: { hacked: true },
        },
      },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(state.officialQuoteSave).not.toHaveBeenCalled();
  });

  it("loads a persisted Quote through the sanitized public contract", async () => {
    const loaded = {
      quoteId: id(10),
      quoteNumber: 1001,
      status: "DRAFT",
      revision: 2,
      snapshotId: id(12),
      snapshotVersion: 2,
      savedAt: now,
      request: {
        productVersionId: id(5),
        request: { commercialQuantity: "1", technicalInputs: {} },
        installments: 3,
        installation: { requested: false },
        munck: { requested: false },
      },
      publicResult: {
        calculationVersion: "1.0",
        productId: id(4),
        productVersionId: id(5),
        productVersionNumber: 2,
        productVersionRevision: 2,
        commercialQuantity: "1",
        installments: 3,
        productSellingPrice: { currency: "BRL", amount: "720" },
        installation: {
          requested: false,
          areaM2: null,
          tier: null,
          price: { currency: "BRL", amount: "0" },
        },
        munck: {
          requested: false,
          requestedHours: null,
          billedHours: null,
          price: { currency: "BRL", amount: "0" },
        },
        subtotalBeforeFinancialRate: { currency: "BRL", amount: "720" },
        roundingRule: "BRL_2DP_HALF_UP_V1",
        totalSellingPrice: { currency: "BRL", amount: "720.00" },
      },
    };
    state.officialQuoteLoad.mockResolvedValueOnce(loaded);
    state.client = client({ id: id(9) }, "consultor_vendas");
    const res = response();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer valid" },
        body: { action: "GET_QUOTE", quoteId: id(10) },
      },
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.payload.data).toEqual(loaded);
    expect(state.officialQuoteLoad).toHaveBeenCalledWith(
      {
        action: "GET_QUOTE",
        quoteId: id(10),
      },
      id(9),
      false
    );
  });

  it("transitions a Quote with the authenticated actor", async () => {
    state.officialQuoteTransition.mockResolvedValueOnce({
      quoteId: id(10),
      quoteNumber: 1001,
      status: "SENT",
      revision: 3,
      snapshotId: id(12),
      updatedAt: now,
    });
    state.client = client({ id: id(9) }, "consultor_vendas");
    const res = response();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer valid" },
        body: {
          action: "TRANSITION_QUOTE",
          quoteId: id(10),
          expectedRevision: 2,
          targetStatus: "SENT",
        },
      },
      res
    );
    expect(res.statusCode).toBe(200);
    expect(state.officialQuoteTransition).toHaveBeenCalledWith(
      {
        action: "TRANSITION_QUOTE",
        quoteId: id(10),
        expectedRevision: 2,
        targetStatus: "SENT",
      },
      id(9),
      false
    );
  });

  it.each(["arte_finalista", "producao", "instalador"])(
    "rejects non-commercial role %s from official Pricing",
    async role => {
      state.client = client({ id: id(9) }, role);
      const res = response();
      await handler(
        {
          method: "POST",
          headers: { authorization: "Bearer valid" },
          body: {
            action: "CALCULATE",
            productVersionId: id(5),
            request: { commercialQuantity: "1", technicalInputs: {} },
            installments: 3,
          },
        },
        res
      );
      expect(res.statusCode).toBe(403);
      expect(state.officialCalculate).not.toHaveBeenCalled();
    }
  );

  it("keeps unexpected Costing persistence failures as server errors", async () => {
    state.officialCalculate.mockRejectedValueOnce(
      new CostingServiceError(
        500,
        "PERSISTENCE_ERROR",
        "Costing persistence failed."
      )
    );
    state.client = client({ id: id(9) }, "consultor_vendas");
    const res = response();

    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer valid" },
        body: {
          action: "CALCULATE",
          productVersionId: id(5),
          request: { commercialQuantity: "1", technicalInputs: {} },
          installments: 3,
        },
      },
      res
    );

    expect(res.statusCode).toBe(500);
    expect(res.payload).toEqual({
      ok: false,
      error: {
        code: "COSTING_SERVICE_ERROR",
        message: "Official Pricing could not be calculated.",
      },
    });
  });

  it("maps only known missing Costing resources to configuration errors", async () => {
    state.officialCalculate.mockRejectedValueOnce(
      new CostingServiceError(
        404,
        "RESOURCE_NOT_FOUND",
        "Cost resource not found."
      )
    );
    state.client = client({ id: id(9) }, "consultor_vendas");
    const res = response();

    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer valid" },
        body: {
          action: "CALCULATE",
          productVersionId: id(5),
          request: { commercialQuantity: "1", technicalInputs: {} },
          installments: 3,
        },
      },
      res
    );

    expect(res.statusCode).toBe(422);
    expect(res.payload.error).toEqual({
      code: "COSTING_NOT_CONFIGURED",
      message: "Costing is not configured for this product.",
    });
  });

  it("returns a client error for unpublished product versions", async () => {
    state.officialCalculate.mockRejectedValueOnce(
      new CostingDomainError(
        "PRODUCT_VERSION_NOT_PUBLISHED",
        "A new official costing requires a PUBLISHED product version"
      )
    );
    state.client = client({ id: id(9) }, "consultor_vendas");
    const res = response();

    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer valid" },
        body: {
          action: "CALCULATE",
          productVersionId: id(5),
          request: { commercialQuantity: "1", technicalInputs: {} },
          installments: 3,
        },
      },
      res
    );

    expect(res.statusCode).toBe(422);
    expect(res.payload.error).toEqual({
      code: "PRODUCT_VERSION_NOT_PUBLISHED",
      message:
        "The selected product version is not available for official Pricing.",
    });
  });

  it("does not allow consultants to use manager Pricing mutations", async () => {
    state.client = client({ id: id(9) }, "consultor_vendas");
    const res = response();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer valid" },
        body: {
          action: "SET_PAYMENT_TERM",
          installments: 6,
          rate: "0.05",
          expectedRevision: null,
        },
      },
      res
    );
    expect(res.statusCode).toBe(403);
    expect(state.client.rpc).not.toHaveBeenCalled();
  });

  it("rejects authority fields in CALCULATE before invoking the service", async () => {
    state.client = client({ id: id(9) }, "consultor_vendas");
    const res = response();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer valid" },
        body: {
          action: "CALCULATE",
          productVersionId: id(5),
          request: { commercialQuantity: "1", technicalInputs: {} },
          installments: 3,
          markup: "2",
        },
      },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(state.officialCalculate).not.toHaveBeenCalled();
  });

  it("requires explicit publication CAS state from the caller", async () => {
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
        },
      },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.payload.error.code).toBe("INVALID_PAYLOAD");
    expect(state.client.rpc).not.toHaveBeenCalled();
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
