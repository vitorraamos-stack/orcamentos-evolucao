import { describe, expect, it } from "vitest";
import {
  QuoteNegotiationDomainError,
  evaluateQuoteNegotiation,
  toPublicQuoteNegotiation,
} from "./negotiation";

describe("Quote negotiation domain 18G", () => {
  it("keeps the official total unchanged when there is no negotiation", () => {
    const result = evaluateQuoteNegotiation({
      officialTotal: "1200.00",
      minimumAllowedTotal: "950.00",
      negotiation: { mode: "OFFICIAL" },
    });

    expect(result.finalTotal.amount).toBe("1200.00");
    expect(result.adjustmentKind).toBe("NONE");
    expect(result.belowMinimum).toBe(false);
  });

  it("allows a manager adjustment above the minimum without below-minimum override", () => {
    const result = evaluateQuoteNegotiation({
      officialTotal: "1200.00",
      minimumAllowedTotal: "950.00",
      negotiation: {
        mode: "MANAGER_FINAL_PRICE",
        finalAmount: "1100.00",
        reason: "Negociação comercial aprovada",
        allowBelowMinimum: false,
      },
    });

    expect(result.adjustmentKind).toBe("DISCOUNT");
    expect(result.adjustmentAmount.amount).toBe("100.00");
    expect(result.finalTotal.amount).toBe("1100.00");
    expect(result.belowMinimum).toBe(false);
  });

  it("requires explicit override below the minimum", () => {
    expect(() =>
      evaluateQuoteNegotiation({
        officialTotal: "1200.00",
        minimumAllowedTotal: "950.00",
        negotiation: {
          mode: "MANAGER_FINAL_PRICE",
          finalAmount: "900.00",
          reason: "Exceção comercial autorizada",
          allowBelowMinimum: false,
        },
      })
    ).toThrowError(QuoteNegotiationDomainError);

    try {
      evaluateQuoteNegotiation({
        officialTotal: "1200.00",
        minimumAllowedTotal: "950.00",
        negotiation: {
          mode: "MANAGER_FINAL_PRICE",
          finalAmount: "900.00",
          reason: "Exceção comercial autorizada",
          allowBelowMinimum: false,
        },
      });
    } catch (error) {
      expect((error as QuoteNegotiationDomainError).code).toBe(
        "BELOW_MINIMUM_OVERRIDE_REQUIRED"
      );
    }
  });

  it("accepts a below-minimum adjustment only with explicit override and reason", () => {
    const result = evaluateQuoteNegotiation({
      officialTotal: "1200.00",
      minimumAllowedTotal: "950.00",
      negotiation: {
        mode: "MANAGER_FINAL_PRICE",
        finalAmount: "900.00",
        reason: "Exceção comercial autorizada pelo gerente",
        allowBelowMinimum: true,
      },
    });

    expect(result.finalTotal.amount).toBe("900.00");
    expect(result.belowMinimum).toBe(true);
    expect(result.belowMinimumOverride).toBe(true);
  });

  it("rejects an unnecessary below-minimum override", () => {
    expect(() =>
      evaluateQuoteNegotiation({
        officialTotal: "1200.00",
        minimumAllowedTotal: "950.00",
        negotiation: {
          mode: "MANAGER_FINAL_PRICE",
          finalAmount: "1000.00",
          reason: "Ajuste comercial autorizado",
          allowBelowMinimum: true,
        },
      })
    ).toThrowError(
      expect.objectContaining({
        code: "BELOW_MINIMUM_OVERRIDE_NOT_APPLICABLE",
      })
    );
  });

  it("supports an audited surcharge without JavaScript number arithmetic", () => {
    const result = evaluateQuoteNegotiation({
      officialTotal: "1200.00",
      minimumAllowedTotal: "950.00",
      negotiation: {
        mode: "MANAGER_FINAL_PRICE",
        finalAmount: "1250.25",
        reason: "Escopo comercial adicional",
        allowBelowMinimum: false,
      },
    });

    expect(result.adjustmentKind).toBe("SURCHARGE");
    expect(result.adjustmentAmount.amount).toBe("50.25");
  });

  it("projects only the final authorized total to the public negotiation DTO", () => {
    const evaluation = evaluateQuoteNegotiation({
      officialTotal: "1200.00",
      minimumAllowedTotal: "950.00",
      negotiation: {
        mode: "MANAGER_FINAL_PRICE",
        finalAmount: "900.00",
        reason: "Exceção comercial autorizada pelo gerente",
        allowBelowMinimum: true,
      },
    });

    const publicResult = toPublicQuoteNegotiation(evaluation);
    const serialized = JSON.stringify(publicResult);

    expect(publicResult).toEqual({
      pricingMode: "MANAGER_ADJUSTED",
      totalSellingPrice: { currency: "BRL", amount: "900.00" },
    });
    expect(serialized).not.toContain("minimum");
    expect(serialized).not.toContain("reason");
    expect(serialized).not.toContain("override");
    expect(serialized).not.toContain("officialTotal");
  });
});
