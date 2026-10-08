import { describe, expect, it } from "vitest";
import type {
  OfficialQuoteCalculationResult,
} from "./calculationService";
import {
  QuoteNegotiationService,
  QuoteNegotiationServiceError,
  minimumAllowedQuoteTotal,
} from "./negotiationService";

const calculation = {
  publicResult: {
    calculationVersion: "1.0",
    productId: "11111111-1111-4111-8111-111111111111",
    productVersionId: "22222222-2222-4222-8222-222222222222",
    productVersionNumber: 1,
    productVersionRevision: 1,
    commercialQuantity: "1",
    installments: 1,
    productSellingPrice: { currency: "BRL", amount: "1050" },
    installation: {
      requested: true,
      areaM2: "0.8",
      tier: "TIER_1",
      price: { currency: "BRL", amount: "150" },
    },
    munck: {
      requested: false,
      requestedHours: null,
      billedHours: null,
      price: { currency: "BRL", amount: "0" },
    },
    subtotalBeforeFinancialRate: { currency: "BRL", amount: "1200" },
    roundingRule: "BRL_2DP_HALF_UP_V1",
    totalSellingPrice: { currency: "BRL", amount: "1200.00" },
  },
  pricing: {
    commercial: {
      minimumSellingPrice: { currency: "BRL", amount: "800" },
      financialRate: "0",
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
    updatedAt: "2026-10-08T10:00:00.000Z",
    updatedBy: "33333333-3333-4333-8333-333333333333",
  },
} as unknown as OfficialQuoteCalculationResult;

describe("QuoteNegotiationService 18G", () => {
  it("derives the protected floor server-side from product minimum plus additions", () => {
    expect(minimumAllowedQuoteTotal(calculation)).toBe("950.00");
  });

  it("keeps consultants on the official price", () => {
    const result = new QuoteNegotiationService().evaluate(
      calculation,
      { mode: "OFFICIAL" },
      false
    );

    expect(result.publicResult.totalSellingPrice.amount).toBe("1200.00");
    expect(result.publicResult.pricingMode).toBe("OFFICIAL");
  });

  it("rejects manual final price from consultants", () => {
    expect(() =>
      new QuoteNegotiationService().evaluate(
        calculation,
        {
          mode: "MANAGER_FINAL_PRICE",
          finalAmount: "1100.00",
          reason: "Negociação comercial aprovada",
          allowBelowMinimum: false,
        },
        false
      )
    ).toThrowError(
      expect.objectContaining({
        code: "QUOTE_NEGOTIATION_FORBIDDEN",
        status: 403,
      })
    );
  });

  it("allows managers to negotiate above the protected floor", () => {
    const result = new QuoteNegotiationService().evaluate(
      calculation,
      {
        mode: "MANAGER_FINAL_PRICE",
        finalAmount: "1000.00",
        reason: "Condição comercial aprovada",
        allowBelowMinimum: false,
      },
      true
    );

    expect(result.privateEvaluation.minimumAllowedTotal.amount).toBe("950.00");
    expect(result.privateEvaluation.adjustmentKind).toBe("DISCOUNT");
    expect(result.publicResult).toEqual({
      pricingMode: "MANAGER_ADJUSTED",
      totalSellingPrice: { currency: "BRL", amount: "1000.00" },
    });
  });

  it("requires the explicit below-minimum override even for managers", () => {
    expect(() =>
      new QuoteNegotiationService().evaluate(
        calculation,
        {
          mode: "MANAGER_FINAL_PRICE",
          finalAmount: "900.00",
          reason: "Exceção aprovada pelo gerente",
          allowBelowMinimum: false,
        },
        true
      )
    ).toThrowError(
      expect.objectContaining({
        code: "BELOW_MINIMUM_OVERRIDE_REQUIRED",
        status: 422,
      })
    );
  });

  it("keeps minimum and reason private after an authorized exception", () => {
    const result = new QuoteNegotiationService().evaluate(
      calculation,
      {
        mode: "MANAGER_FINAL_PRICE",
        finalAmount: "900.00",
        reason: "Exceção aprovada pelo gerente",
        allowBelowMinimum: true,
      },
      true
    );

    expect(result.privateEvaluation.belowMinimum).toBe(true);
    expect(result.privateEvaluation.reason).toBe(
      "Exceção aprovada pelo gerente"
    );
    expect(JSON.stringify(result.publicResult)).not.toContain("950");
    expect(JSON.stringify(result.publicResult)).not.toContain("reason");
  });
});
