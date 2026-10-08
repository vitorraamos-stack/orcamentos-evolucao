import { describe, expect, it } from "vitest";
import { quoteCommercialMetricsSchema } from "./persistence.js";

describe("Quote commercial metrics contract 18M", () => {
  const valid = {
    totalQuotes: 10,
    draftQuotes: 2,
    sentQuotes: 2,
    openQuotes: 4,
    acceptedQuotes: 3,
    rejectedQuotes: 2,
    cancelledQuotes: 1,
    decidedQuotes: 5,
    conversionBps: 6000,
    acceptedValue: { currency: "BRL", amount: "4350.00" },
    rejectedWithoutReason: 1,
    lossReasons: [{ code: "PRICE", count: 1 }],
  } as const;

  it("accepts a coherent commercial funnel", () => {
    expect(quoteCommercialMetricsSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects inconsistent open and decision counts", () => {
    expect(
      quoteCommercialMetricsSchema.safeParse({
        ...valid,
        openQuotes: 99,
      }).success
    ).toBe(false);
    expect(
      quoteCommercialMetricsSchema.safeParse({
        ...valid,
        decidedQuotes: 99,
      }).success
    ).toBe(false);
  });

  it("rejects cancellation-only reason codes in loss analytics", () => {
    expect(
      quoteCommercialMetricsSchema.safeParse({
        ...valid,
        lossReasons: [{ code: "DUPLICATE", count: 1 }],
      }).success
    ).toBe(false);
  });
});
