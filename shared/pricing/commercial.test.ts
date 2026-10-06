import { describe, expect, it } from "vitest";
import {
  PRICING_COMMERCIAL_ROUNDING,
  calculateCommercialPricing,
} from "./commercial";
import { PricingDomainError } from "./errors";

describe("commercial pricing", () => {
  it("keeps the engine base when it is above the product minimum", () => {
    const result = calculateCommercialPricing({
      baseSellingPrice: "120",
      minimumSellingPrice: "100",
      financialRate: "0",
    });
    expect(result).toMatchObject({
      minimumApplied: false,
      priceAfterMinimum: { currency: "BRL", amount: "120" },
      totalSellingPrice: { currency: "BRL", amount: "120.00" },
      roundingRule: PRICING_COMMERCIAL_ROUNDING,
    });
  });

  it("applies the product minimum before the financial rate", () => {
    const result = calculateCommercialPricing({
      baseSellingPrice: "70",
      minimumSellingPrice: "100",
      financialRate: "0.05",
    });
    expect(result.minimumApplied).toBe(true);
    expect(result.priceAfterMinimum.amount).toBe("100");
    expect(result.unroundedTotalSellingPrice.amount).toBe(
      "105.26315789473684210526315789473684210526315789474"
    );
    expect(result.totalSellingPrice.amount).toBe("105.26");
  });

  it.each([
    ["10.004", "10.00"],
    ["10.005", "10.01"],
    ["10.006", "10.01"],
    ["0", "0.00"],
  ])("rounds %s with commercial HALF_UP to %s", (value, expected) => {
    expect(
      calculateCommercialPricing({
        baseSellingPrice: value,
        minimumSellingPrice: "0",
        financialRate: "0",
      }).totalSellingPrice.amount
    ).toBe(expected);
  });

  it("grosses up selling-price financial rates exactly", () => {
    const result = calculateCommercialPricing({
      baseSellingPrice: "1",
      minimumSellingPrice: "0",
      financialRate: "0.25",
    });
    expect(result.unroundedTotalSellingPrice.amount).toBe(
      "1.3333333333333333333333333333333333333333333333333"
    );
    expect(result.totalSellingPrice.amount).toBe("1.33");
  });

  it.each([
    { baseSellingPrice: -1, minimumSellingPrice: "0", financialRate: "0" },
    { baseSellingPrice: "1", minimumSellingPrice: "-1", financialRate: "0" },
    { baseSellingPrice: "1", minimumSellingPrice: "0", financialRate: 0.1 },
    { baseSellingPrice: "1", minimumSellingPrice: "0", financialRate: "1" },
  ])("fails closed for invalid input %#", input => {
    expect(() => calculateCommercialPricing(input)).toThrowError(
      expect.objectContaining({
        code: "INVALID_COMMERCIAL_PRICING_INPUT",
      })
    );
  });

  it("never uses binary floating point in the public contract", () => {
    const result = calculateCommercialPricing({
      baseSellingPrice: "999999999999999999.995",
      minimumSellingPrice: "0",
      financialRate: "0",
    });
    expect(result.totalSellingPrice.amount).toBe("1000000000000000000.00");
    expect(typeof result.totalSellingPrice.amount).toBe("string");
  });
});
