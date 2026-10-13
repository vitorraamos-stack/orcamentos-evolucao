import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/modules/quotes/pages/QuoteCalculatorPage.tsx",
  "utf8"
);

describe("QuoteCalculatorPage stateless history boundary 19A", () => {
  it("does not load or render persisted Quote history", () => {
    expect(source).not.toContain("quoteRepository.history(");
    expect(source).not.toContain("QuoteHistoryItem");
    expect(source).not.toContain("historyItems");
    expect(source).not.toContain("Histórico");
    expect(source).not.toContain("Snapshot v");
  });
});
