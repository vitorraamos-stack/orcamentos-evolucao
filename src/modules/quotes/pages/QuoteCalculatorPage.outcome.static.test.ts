import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/modules/quotes/pages/QuoteCalculatorPage.tsx",
  "utf8"
);

describe("QuoteCalculatorPage lifecycle boundary 19A", () => {
  it("does not manage commercial Quote lifecycle or outcome reasons", () => {
    expect(source).not.toContain("TRANSITION_QUOTE");
    expect(source).not.toContain("openOutcomeDialog");
    expect(source).not.toContain("QuoteOutcomeReason");
    expect(source).not.toContain("REJECTED_REASON_OPTIONS");
    expect(source).not.toContain("CANCELLED_REASON_OPTIONS");
    expect(source).not.toContain("Marcar enviado");
    expect(source).not.toContain("Criar OS a partir deste orçamento");
  });
});
