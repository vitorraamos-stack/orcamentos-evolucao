import { describe, expect, it } from "vitest";
import { calculateQuoteCommercial } from "./calculation";

const settings = {
  tier1MaxAreaM2: "1",
  tier1Price: "150",
  tier2MaxAreaM2: "2",
  tier2Price: "180",
  tier3Price: "200",
  munckHourlyPrice: "375",
  munckMinimumHours: "4",
  revision: 1,
  updatedAt: "2026-10-07T12:00:00Z",
  updatedBy: "10000000-0000-4000-8000-000000000009",
} as const;

const input = (overrides: Record<string, unknown> = {}) => ({
  productSellingPrice: "700",
  financialRate: "0",
  installationRequested: true,
  installationAreaM2: "1",
  munckRequestedHours: null,
  settings,
  ...overrides,
});

describe("calculateQuoteCommercial", () => {
  it.each([
    ["1", "TIER_1", "150", "850.00"],
    ["1.01", "TIER_2", "180", "880.00"],
    ["2", "TIER_2", "180", "880.00"],
    ["2.01", "TIER_3", "200", "900.00"],
  ] as const)(
    "applies the official installation tier for %s m2",
    (areaM2, tier, installationPrice, total) => {
      const result = calculateQuoteCommercial(
        input({ installationAreaM2: areaM2 })
      );
      expect(result.installation).toMatchObject({
        requested: true,
        areaM2,
        tier,
        price: { currency: "BRL", amount: installationPrice },
      });
      expect(result.totalSellingPrice.amount).toBe(total);
    }
  );

  it("enforces the minimum munck hours", () => {
    const result = calculateQuoteCommercial(
      input({
        installationRequested: false,
        installationAreaM2: null,
        munckRequestedHours: "2",
      })
    );
    expect(result.munck).toMatchObject({
      requested: true,
      requestedHours: "2",
      billedHours: "4",
      price: { amount: "1500" },
    });
    expect(result.subtotalBeforeFinancialRate.amount).toBe("2200");
    expect(result.totalSellingPrice.amount).toBe("2200.00");
  });

  it("charges requested munck hours when they exceed the minimum", () => {
    const result = calculateQuoteCommercial(
      input({
        installationRequested: false,
        installationAreaM2: null,
        munckRequestedHours: "6",
      })
    );
    expect(result.munck.billedHours).toBe("6");
    expect(result.munck.price.amount).toBe("2250");
    expect(result.totalSellingPrice.amount).toBe("2950.00");
  });

  it("applies the financial rate after product and additions", () => {
    const result = calculateQuoteCommercial(
      input({
        installationAreaM2: "1",
        munckRequestedHours: "4",
        financialRate: "0.05",
      })
    );
    expect(result.subtotalBeforeFinancialRate.amount).toBe("2350");
    expect(result.totalSellingPrice.amount).toBe("2473.68");
  });

  it("requires an authoritative installation area when installation is requested", () => {
    expect(() =>
      calculateQuoteCommercial(
        input({ installationAreaM2: null })
      )
    ).toThrow();
  });
});
