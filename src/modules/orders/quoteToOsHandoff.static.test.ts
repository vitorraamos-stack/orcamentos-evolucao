import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Quote → OS UI handoff is outside the estimator scope 19A", () => {
  it("does not expose OS creation from the intelligent estimator", () => {
    const calculator = readFileSync(
      "src/modules/quotes/pages/QuoteCalculatorPage.tsx",
      "utf8"
    );

    expect(calculator).not.toContain("createOrderFromQuotePath");
    expect(calculator).not.toContain("Criar OS a partir deste orçamento");
    expect(calculator).not.toContain('saved.status === "ACCEPTED"');
  });
});
