import { describe, expect, it } from "vitest";
import {
  officialPricingApiRequestSchema,
  officialPricingPublicResultSchema,
  officialPricingRequestSchema,
} from "./officialCalculation";

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("official pricing contracts", () => {
  const request = {
    productVersionId: id(1),
    request: {
      commercialQuantity: "2",
      technicalInputs: {},
    },
    installments: 3,
  };

  it("accepts the intentionally small authoritative request", () => {
    expect(officialPricingRequestSchema.parse(request)).toEqual(request);
    expect(
      officialPricingApiRequestSchema.parse({ action: "CALCULATE", ...request })
        .action
    ).toBe("CALCULATE");
  });

  it.each([0, 13, 1.5, "6"])("rejects invalid installments %s", installments => {
    expect(
      officialPricingRequestSchema.safeParse({ ...request, installments }).success
    ).toBe(false);
  });

  it("rejects commercial authority fields supplied by the browser", () => {
    expect(
      officialPricingApiRequestSchema.safeParse({
        action: "CALCULATE",
        ...request,
        cost: "100",
        markup: "1",
        minimumSellingPrice: "200",
        financialRate: "0.05",
        pricingPolicyId: id(2),
      }).success
    ).toBe(false);
  });

  it("keeps the public result free of private Pricing internals", () => {
    const publicResult = {
      calculationVersion: "1.0",
      productId: id(2),
      productVersionId: id(1),
      productVersionNumber: 4,
      productVersionRevision: 7,
      commercialQuantity: "2",
      installments: 6,
      roundingRule: "BRL_2DP_HALF_UP_V1",
      totalSellingPrice: { currency: "BRL", amount: "321.45" },
    };
    expect(officialPricingPublicResultSchema.parse(publicResult)).toEqual(
      publicResult
    );
    expect(
      officialPricingPublicResultSchema.safeParse({
        ...publicResult,
        totalCost: { currency: "BRL", amount: "100" },
      }).success
    ).toBe(false);
  });
});
