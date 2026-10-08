import { describe, expect, it } from "vitest";
import { quoteTransitionApiRequestSchema } from "./persistence.js";

const base = {
  action: "TRANSITION_QUOTE" as const,
  quoteId: "10000000-0000-4000-8000-000000000010",
  expectedRevision: 2,
};

describe("Quote commercial outcome contract 18L", () => {
  it("keeps ordinary transitions backward-compatible when outcomeReason is omitted", () => {
    const parsed = quoteTransitionApiRequestSchema.safeParse({
      ...base,
      targetStatus: "SENT",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.outcomeReason).toBeNull();
  });

  it("requires a reason for rejected Quotes", () => {
    expect(
      quoteTransitionApiRequestSchema.safeParse({
        ...base,
        targetStatus: "REJECTED",
      }).success
    ).toBe(false);
  });

  it("accepts rejection reason PRICE with optional note", () => {
    expect(
      quoteTransitionApiRequestSchema.safeParse({
        ...base,
        targetStatus: "REJECTED",
        outcomeReason: { code: "PRICE", note: null },
      }).success
    ).toBe(true);
  });

  it("rejects cancellation-only reasons on REJECTED", () => {
    expect(
      quoteTransitionApiRequestSchema.safeParse({
        ...base,
        targetStatus: "REJECTED",
        outcomeReason: { code: "DUPLICATE", note: null },
      }).success
    ).toBe(false);
  });

  it("requires a descriptive note for OTHER", () => {
    expect(
      quoteTransitionApiRequestSchema.safeParse({
        ...base,
        targetStatus: "CANCELLED",
        outcomeReason: { code: "OTHER", note: "x" },
      }).success
    ).toBe(false);
    expect(
      quoteTransitionApiRequestSchema.safeParse({
        ...base,
        targetStatus: "CANCELLED",
        outcomeReason: { code: "OTHER", note: "Cliente mudou o escopo." },
      }).success
    ).toBe(true);
  });

  it("forbids outcome data on SENT and ACCEPTED", () => {
    for (const targetStatus of ["SENT", "ACCEPTED"] as const)
      expect(
        quoteTransitionApiRequestSchema.safeParse({
          ...base,
          targetStatus,
          outcomeReason: { code: "PRICE", note: null },
        }).success
      ).toBe(false);
  });
});
