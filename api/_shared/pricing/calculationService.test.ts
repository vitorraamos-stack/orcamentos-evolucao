import { describe, expect, it, vi } from "vitest";
import type { CostingAggregateResult } from "../../../shared/costing/index.js";
import type { OfficialPricingContext } from "./calculationContext.js";
import {
  OfficialPricingCalculationError,
  OfficialPricingCalculationService,
} from "./calculationService";

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = "2026-10-06T12:00:00Z";

const costing = (): CostingAggregateResult => ({
  aggregationVersion: "1.0",
  productId: id(4),
  productVersionId: id(5),
  productVersionNumber: 7,
  productVersionRevision: 3,
  effectiveCostAt: now as any,
  commercialQuantity: "2" as any,
  resolvedInputs: [],
  components: [],
  unitVariableCost: { currency: "BRL", amount: "25" as any },
  quoteItemFixedCost: { currency: "BRL", amount: "0" as any },
  totalCost: { currency: "BRL", amount: "50" as any },
});

const context = (): OfficialPricingContext => ({
  productSettings: {
    productId: id(4) as any,
    pricingPolicyId: id(1) as any,
    minimumSellingPrice: "120" as any,
    revision: 2,
    updatedAt: now as any,
    updatedBy: id(9),
  },
  policy: {
    id: id(1) as any,
    code: "STANDARD",
    name: "Standard",
    description: null,
    status: "ACTIVE",
  },
  definition: {
    schemaVersion: "1.0",
    version: {
      id: id(2) as any,
      pricingPolicyId: id(1) as any,
      versionNumber: 3,
      revision: 5,
      status: "PUBLISHED",
      notes: null,
      createdAt: now as any,
      createdBy: id(9),
      publishedAt: now as any,
      publishedBy: id(9),
    },
    strategy: {
      type: "MARKUP_ON_COST",
      markup: "1" as any,
      markupBase: "TOTAL_COST",
    },
    charges: [],
  },
  payment: {
    source: "CONFIGURED",
    installments: 6,
    rate: "0.05" as any,
    revision: 4,
  },
});

const input = {
  productVersionId: id(5),
  request: { commercialQuantity: "2", technicalInputs: {} },
  installments: 6,
};

describe("OfficialPricingCalculationService", () => {
  it("chains official cost -> markup -> minimum -> financial rate -> HALF_UP", async () => {
    const costingLoader = { calculate: vi.fn(async () => costing()) };
    const pricingLoader = {
      loadOfficialCalculationContext: vi.fn(async () => context()),
    };
    const result = await new OfficialPricingCalculationService(
      costingLoader,
      pricingLoader
    ).calculate(input);

    expect(costingLoader.calculate).toHaveBeenCalledWith({
      productVersionId: id(5),
      request: input.request,
    });
    expect(pricingLoader.loadOfficialCalculationContext).toHaveBeenCalledWith(
      id(4),
      6
    );

    // Costing total 50 is already quantity-expanded. Markup 100% => base 100,
    // then product minimum 120, then 5% selling-price fee => 126.315... => 126.32.
    expect(result.pricingEngine.unroundedTotalSellingPrice.amount).toBe("100");
    expect(result.commercial.priceAfterMinimum.amount).toBe("120");
    expect(result.commercial.totalSellingPrice.amount).toBe("126.32");
    expect(result.publicResult.totalSellingPrice.amount).toBe("126.32");
  });

  it("does not multiply the official cost by commercial quantity a second time", async () => {
    const result = await new OfficialPricingCalculationService(
      { calculate: async () => costing() },
      {
        loadOfficialCalculationContext: async () => ({
          ...context(),
          productSettings: {
            ...context().productSettings,
            minimumSellingPrice: "0" as any,
          },
          payment: {
            source: "SYSTEM_ZERO",
            installments: 2,
            rate: "0" as any,
            revision: null,
          },
        }),
      }
    ).calculate({ ...input, installments: 2 });

    expect(result.pricingEngine.unroundedTotalSellingPrice.amount).toBe("100");
    expect(result.publicResult.totalSellingPrice.amount).toBe("100.00");
  });

  it("keeps private cost, policy, markup, minimum and rate out of publicResult", async () => {
    const result = await new OfficialPricingCalculationService(
      { calculate: async () => costing() },
      { loadOfficialCalculationContext: async () => context() }
    ).calculate(input);

    expect(result.publicResult).toEqual({
      calculationVersion: "1.0",
      productId: id(4),
      productVersionId: id(5),
      productVersionNumber: 7,
      productVersionRevision: 3,
      commercialQuantity: "2",
      installments: 6,
      roundingRule: "BRL_2DP_HALF_UP_V1",
      totalSellingPrice: { currency: "BRL", amount: "126.32" },
    });
    expect(result.publicResult).not.toHaveProperty("totalCost");
    expect(result.publicResult).not.toHaveProperty("pricingPolicyId");
    expect(result.publicResult).not.toHaveProperty("markup");
    expect(result.publicResult).not.toHaveProperty("minimumSellingPrice");
    expect(result.publicResult).not.toHaveProperty("financialRate");
  });

  it("fails closed when the authoritative context points at another product", async () => {
    const wrong = context();
    wrong.productSettings = {
      ...wrong.productSettings,
      productId: id(8) as any,
    };
    await expect(
      new OfficialPricingCalculationService(
        { calculate: async () => costing() },
        { loadOfficialCalculationContext: async () => wrong }
      ).calculate(input)
    ).rejects.toBeInstanceOf(OfficialPricingCalculationError);
  });

  it("rejects authority fields in the service request", async () => {
    await expect(
      new OfficialPricingCalculationService(
        { calculate: async () => costing() },
        { loadOfficialCalculationContext: async () => context() }
      ).calculate({
        ...input,
        markup: "3",
      })
    ).rejects.toMatchObject({
      status: 400,
      code: "INVALID_OFFICIAL_PRICING_REQUEST",
    });
  });
});
