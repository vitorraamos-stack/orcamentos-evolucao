import { describe, expect, it, vi } from "vitest";
import {
  OfficialQuotePersistenceService,
  QuotePersistenceServiceError,
  mapQuotePersistenceError,
} from "./persistenceService";
import type { OfficialQuoteCalculationResult } from "./calculationService";

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = "2026-10-07T12:00:00Z";

const calculation = (): OfficialQuoteCalculationResult =>
  ({
    publicResult: {
      calculationVersion: "1.0",
      productId: id(1),
      productVersionId: id(2),
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
    },
    pricing: {
      publicResult: {} as any,
      costing: {
        aggregationVersion: "1.0",
        productId: id(1),
        productVersionId: id(2),
        productVersionNumber: 2,
        productVersionRevision: 2,
        effectiveCostAt: now,
        commercialQuantity: "1",
        resolvedInputs: [],
        components: [],
        unitVariableCost: { currency: "BRL", amount: "240" },
        quoteItemFixedCost: { currency: "BRL", amount: "0" },
        totalCost: { currency: "BRL", amount: "240" },
      },
      pricingEngine: {
        engineVersion: "1.0",
        schemaVersion: "1.0",
        policyId: id(3),
        policyVersionId: id(4),
        policyVersionNumber: 1,
        policyVersionRevision: 1,
        productId: id(1),
        productVersionId: id(2),
        productVersionNumber: 2,
        productVersionRevision: 2,
        costingAggregationVersion: "1.0",
        effectiveCostAt: now,
        commercialQuantity: "1",
        strategy: {
          type: "MARKUP_ON_COST",
          markup: "2",
          markupBase: "TOTAL_COST",
        },
        technicalPrecision: "DECIMAL_50_HALF_EVEN_V1",
        unroundedTotalSellingPrice: { currency: "BRL", amount: "720" },
        breakdown: {
          totalCost: { currency: "BRL", amount: "240" },
          costBasedCharges: { currency: "BRL", amount: "0" },
          sellingPriceBasedCharges: { currency: "BRL", amount: "0" },
          profitAmount: { currency: "BRL", amount: "480" },
          realizedMargin: "0.66666666666666666667",
        },
      },
      commercial: {
        roundingRule: "BRL_2DP_HALF_UP_V1",
        minimumApplied: false,
        baseSellingPrice: { currency: "BRL", amount: "720" },
        minimumSellingPrice: { currency: "BRL", amount: "700" },
        priceAfterMinimum: { currency: "BRL", amount: "720" },
        financialRate: "0",
        unroundedTotalSellingPrice: { currency: "BRL", amount: "720" },
        totalSellingPrice: { currency: "BRL", amount: "720.00" },
      },
      privateProvenance: {
        productPricingSettingsRevision: 1,
        paymentRateSource: "SYSTEM_ZERO",
        paymentTermRevision: null,
      },
    },
    installationSettingsRevision: 1,
    installationSettings: {
      tier1MaxAreaM2: "1",
      tier1Price: "150",
      tier2MaxAreaM2: "2",
      tier2Price: "180",
      tier3Price: "200",
      munckHourlyPrice: "375",
      munckMinimumHours: "4",
      revision: 1,
      updatedAt: now,
      updatedBy: id(9),
    },
  }) as OfficialQuoteCalculationResult;

const request = {
  quoteId: null,
  expectedRevision: null,
  productVersionId: id(2),
  request: {
    commercialQuantity: "1",
    technicalInputs: {},
  },
  installments: 3,
  installation: { requested: true },
  munck: { requested: false },
};

describe("OfficialQuotePersistenceService", () => {
  it("recalculates server-side before creating an immutable snapshot", async () => {
    const db = {
      rpc: vi.fn(async () => ({
        data: {
          quote_id: id(10),
          quote_number: 1001,
          status: "DRAFT",
          revision: 1,
          snapshot_id: id(11),
          snapshot_version: 1,
          saved_at: now,
        },
        error: null,
      })),
    };
    const calculator = { calculate: vi.fn(async () => calculation()) };
    const result = await new OfficialQuotePersistenceService(
      db,
      calculator
    ).save(request, id(9));

    expect(calculator.calculate).toHaveBeenCalledWith({
      productVersionId: id(2),
      request: request.request,
      installments: 3,
      installation: { requested: true },
      munck: { requested: false },
    });
    expect(db.rpc).toHaveBeenCalledWith(
      "quote_create_with_snapshot_secure",
      expect.objectContaining({
        p_actor_id: id(9),
        p_total_selling_price: "870.00",
        p_pricing_policy_id: id(3),
        p_pricing_policy_version_id: id(4),
        p_request_snapshot: expect.objectContaining({
          productVersionId: id(2),
        }),
        p_private_snapshot: expect.objectContaining({
          costing: expect.any(Object),
          pricingEngine: expect.any(Object),
          installationSettings: expect.any(Object),
        }),
      })
    );
    expect(result).toMatchObject({
      quoteId: id(10),
      quoteNumber: 1001,
      revision: 1,
      snapshotVersion: 1,
      publicResult: { totalSellingPrice: { amount: "870.00" } },
    });
  });

  it("appends with optimistic locking for an existing DRAFT quote", async () => {
    const db = {
      rpc: vi.fn(async () => ({
        data: {
          quote_id: id(10),
          quote_number: 1001,
          status: "DRAFT",
          revision: 2,
          snapshot_id: id(12),
          snapshot_version: 2,
          saved_at: now,
        },
        error: null,
      })),
    };
    const service = new OfficialQuotePersistenceService(db, {
      calculate: async () => calculation(),
    });
    await service.save(
      { ...request, quoteId: id(10), expectedRevision: 1 },
      id(9)
    );
    expect(db.rpc).toHaveBeenCalledWith(
      "quote_append_snapshot_secure",
      expect.objectContaining({
        p_quote_id: id(10),
        p_expected_revision: 1,
        p_actor_id: id(9),
      })
    );
  });

  it("loads only the public current snapshot contract", async () => {
    const calc = calculation();
    const db = {
      rpc: vi.fn(async () => ({
        data: {
          quote: {
            id: id(10),
            quote_number: 1001,
            status: "DRAFT",
            revision: 2,
          },
          snapshot: {
            id: id(12),
            version_number: 2,
            created_at: now,
            request_snapshot: {
              productVersionId: id(2),
              request: request.request,
              installments: 3,
              installation: { requested: true },
              munck: { requested: false },
            },
            public_result_snapshot: calc.publicResult,
            private_snapshot: { secret: "must-not-leak" },
          },
        },
        error: null,
      })),
    };
    const result = await new OfficialQuotePersistenceService(db, {
      calculate: async () => calc,
    }).load({ action: "GET_QUOTE", quoteId: id(10) });

    expect(result.publicResult.totalSellingPrice.amount).toBe("870.00");
    expect(result).not.toHaveProperty("private_snapshot");
    expect(result).not.toHaveProperty("privateSnapshot");
  });

  it("transitions status using the authenticated actor and expected revision", async () => {
    const db = {
      rpc: vi.fn(async () => ({
        data: {
          quote_id: id(10),
          quote_number: 1001,
          status: "SENT",
          revision: 3,
          snapshot_id: id(12),
          updated_at: now,
        },
        error: null,
      })),
    };
    const result = await new OfficialQuotePersistenceService(db, {
      calculate: async () => calculation(),
    }).transition(
      {
        action: "TRANSITION_QUOTE",
        quoteId: id(10),
        expectedRevision: 2,
        targetStatus: "SENT",
      },
      id(9)
    );
    expect(db.rpc).toHaveBeenCalledWith(
      "quote_transition_status_secure",
      expect.objectContaining({
        p_actor_id: id(9),
        p_expected_revision: 2,
        p_target_status: "SENT",
      })
    );
    expect(result.status).toBe("SENT");
  });

  it("sanitizes SQL persistence errors", () => {
    expect(() =>
      mapQuotePersistenceError({
        message: "duplicate secret constraint internal_details",
      })
    ).toThrowError(
      expect.objectContaining({
        code: "QUOTE_PERSISTENCE_ERROR",
        message: "Quote persistence failed.",
      })
    );
  });

  it("maps stable quote conflict sentinels", () => {
    expect(() =>
      mapQuotePersistenceError({
        message: "QUOTE_REVISION_CONFLICT private details",
      })
    ).toThrowError(
      expect.objectContaining({
        status: 409,
        code: "QUOTE_REVISION_CONFLICT",
        message: "Quote changed since it was loaded.",
      })
    );
  });

  it("rejects an existing quote without expectedRevision before calculation", async () => {
    const calculator = { calculate: vi.fn(async () => calculation()) };
    await expect(
      new OfficialQuotePersistenceService(
        { rpc: vi.fn() },
        calculator
      ).save(
        { ...request, quoteId: id(10), expectedRevision: null },
        id(9)
      )
    ).rejects.toBeInstanceOf(QuotePersistenceServiceError);
    expect(calculator.calculate).not.toHaveBeenCalled();
  });
});
