import { describe, expect, it, vi } from "vitest";
import type { OfficialPricingCalculationResult } from "../pricing/calculationService.js";
import { OfficialQuoteCalculationService } from "./calculationService";

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = "2026-10-07T12:00:00Z";

const pricingResult = (): OfficialPricingCalculationResult =>
  ({
    publicResult: {
      calculationVersion: "1.0",
      productId: id(4),
      productVersionId: id(5),
      productVersionNumber: 2,
      productVersionRevision: 2,
      commercialQuantity: "2",
      installments: 3,
      roundingRule: "BRL_2DP_HALF_UP_V1",
      totalSellingPrice: { currency: "BRL", amount: "700.00" },
    },
    costing: {
      aggregationVersion: "1.0",
      productId: id(4),
      productVersionId: id(5),
      productVersionNumber: 2,
      productVersionRevision: 2,
      effectiveCostAt: now,
      commercialQuantity: "2",
      resolvedInputs: [
        {
          key: "width",
          value: { kind: "decimal", value: "1", unit: "m" },
          source: "PROVIDED",
        },
        {
          key: "height",
          value: { kind: "decimal", value: "0.75", unit: "m" },
          source: "PROVIDED",
        },
      ],
      components: [],
      unitVariableCost: { currency: "BRL", amount: "0" },
      quoteItemFixedCost: { currency: "BRL", amount: "0" },
      totalCost: { currency: "BRL", amount: "0" },
    },
    pricingEngine: {} as any,
    commercial: {
      roundingRule: "BRL_2DP_HALF_UP_V1",
      minimumApplied: true,
      baseSellingPrice: { currency: "BRL", amount: "0" },
      minimumSellingPrice: { currency: "BRL", amount: "700" },
      priceAfterMinimum: { currency: "BRL", amount: "700" },
      financialRate: "0",
      unroundedTotalSellingPrice: { currency: "BRL", amount: "700" },
      totalSellingPrice: { currency: "BRL", amount: "700.00" },
    },
    privateProvenance: {
      productPricingSettingsRevision: 1,
      paymentRateSource: "SYSTEM_ZERO",
      paymentTermRevision: null,
    },
  }) as OfficialPricingCalculationResult;

const settings = {
  tier1MaxAreaM2: "1",
  tier1Price: "150",
  tier2MaxAreaM2: "2",
  tier2Price: "180",
  tier3Price: "200",
  munckHourlyPrice: "375",
  munckMinimumHours: "4",
  revision: 3,
  updatedAt: now,
  updatedBy: id(9),
} as any;

const request = {
  productVersionId: id(5),
  request: {
    commercialQuantity: "2",
    technicalInputs: {},
  },
  installments: 3,
  installation: { requested: true },
  munck: { requested: false },
};

describe("OfficialQuoteCalculationService", () => {
  it("derives installation area from authoritative resolved dimensions and quantity", async () => {
    const pricing = { calculate: vi.fn(async () => pricingResult()) };
    const installation = {
      loadInstallationSettings: vi.fn(async () => settings),
    };
    const result = await new OfficialQuoteCalculationService(
      pricing,
      installation
    ).calculate(request);

    expect(pricing.calculate).toHaveBeenCalledWith({
      productVersionId: id(5),
      request: request.request,
      installments: 3,
    });
    expect(result.publicResult.installation).toMatchObject({
      requested: true,
      areaM2: "1.5",
      tier: "TIER_2",
      price: { amount: "180" },
    });
    expect(result.publicResult.productSellingPrice.amount).toBe("700");
    expect(result.publicResult.totalSellingPrice.amount).toBe("880.00");
    expect(result.installationSettingsRevision).toBe(3);
  });

  it("does not load additional settings for a product-only quote", async () => {
    const pricing = { calculate: vi.fn(async () => pricingResult()) };
    const installation = {
      loadInstallationSettings: vi.fn(async () => settings),
    };
    const result = await new OfficialQuoteCalculationService(
      pricing,
      installation
    ).calculate({
      ...request,
      installation: { requested: false },
      munck: { requested: false },
    });
    expect(installation.loadInstallationSettings).not.toHaveBeenCalled();
    expect(result.installationSettingsRevision).toBeNull();
    expect(result.publicResult.totalSellingPrice.amount).toBe("700.00");
  });

  it("does not require dimensions when installation is not requested", async () => {
    const original = pricingResult();
    const withoutDimensions = {
      ...original,
      costing: { ...original.costing, resolvedInputs: [] },
    } as OfficialPricingCalculationResult;
    const result = await new OfficialQuoteCalculationService(
      { calculate: async () => withoutDimensions },
      { loadInstallationSettings: async () => settings }
    ).calculate({
      ...request,
      installation: { requested: false },
      munck: { requested: true, hours: "2" },
    });
    expect(result.publicResult.installation.price.amount).toBe("0");
    expect(result.publicResult.munck.billedHours).toBe("4");
    expect(result.publicResult.totalSellingPrice.amount).toBe("2200.00");
  });

  it("normalizes compatible length units before deriving installation area", async () => {
    const original = pricingResult();
    const mixedUnits = {
      ...original,
      costing: {
        ...original.costing,
        commercialQuantity: "1",
        resolvedInputs: [
          {
            key: "width",
            value: { kind: "decimal", value: "100", unit: "cm" },
            source: "PROVIDED",
          },
          {
            key: "height",
            value: { kind: "decimal", value: "750", unit: "mm" },
            source: "PROVIDED",
          },
        ],
      },
    } as OfficialPricingCalculationResult;

    const result = await new OfficialQuoteCalculationService(
      { calculate: async () => mixedUnits },
      { loadInstallationSettings: async () => settings }
    ).calculate({ ...request, request: { ...request.request, commercialQuantity: "1" } });

    expect(result.publicResult.installation.areaM2).toBe("0.75");
    expect(result.publicResult.installation.tier).toBe("TIER_1");
  });

  it.each(["0", "-1"])(
    "fails closed for nonpositive installation dimensions (%s m)",
    async width => {
      const original = pricingResult();
      const invalidDimensions = {
        ...original,
        costing: {
          ...original.costing,
          resolvedInputs: original.costing.resolvedInputs.map(input =>
            input.key === "width"
              ? {
                  ...input,
                  value: { kind: "decimal", value: width, unit: "m" },
                }
              : input
          ),
        },
      } as OfficialPricingCalculationResult;

      await expect(
        new OfficialQuoteCalculationService(
          { calculate: async () => invalidDimensions },
          { loadInstallationSettings: async () => settings }
        ).calculate(request)
      ).rejects.toMatchObject({
        status: 422,
        code: "INSTALLATION_AREA_UNAVAILABLE",
      });
    }
  );

  it("fails closed when installation area cannot be derived", async () => {
    const original = pricingResult();
    const missingHeight = {
      ...original,
      costing: {
        ...original.costing,
        resolvedInputs: original.costing.resolvedInputs.filter(
          input => input.key !== "height"
        ),
      },
    } as OfficialPricingCalculationResult;

    await expect(
      new OfficialQuoteCalculationService(
        { calculate: async () => missingHeight },
        { loadInstallationSettings: async () => settings }
      ).calculate(request)
    ).rejects.toMatchObject({
      status: 422,
      code: "INSTALLATION_AREA_UNAVAILABLE",
    });
  });
});
