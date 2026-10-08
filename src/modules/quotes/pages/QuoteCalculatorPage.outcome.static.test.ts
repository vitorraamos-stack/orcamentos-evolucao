import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/modules/quotes/pages/QuoteCalculatorPage.tsx",
  "utf8"
).replaceAll("\r\n", "\n");

describe("QuoteCalculatorPage commercial outcome 18L", () => {
  it("opens a reason dialog instead of directly rejecting or cancelling", () => {
    expect(source).toContain('openOutcomeDialog("REJECTED")');
    expect(source).toContain('openOutcomeDialog("CANCELLED")');
    expect(source).toContain("Registrar orçamento recusado");
    expect(source).toContain("Registre o motivo");
  });

  it("renders only the sanitized outcome reason from history", () => {
    expect(source).toContain("item.outcomeReason");
    expect(source).toContain("OUTCOME_REASON_LABEL");
    expect(source).not.toContain("item.payload");
  });
});
