import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/modules/quotes/pages/QuoteCalculatorPage.tsx",
  "utf8"
);

describe("QuoteCalculatorPage re-scope 19A", () => {
  it("keeps the official calculation flow and copy summary", () => {
    expect(source).toContain(".loadForm()");
    expect(source).toContain("quoteRepository.calculate(request)");
    expect(source).toContain("buildTechnicalInputs(");
    expect(source).toContain("availableInstallments");
    expect(source).toContain("installationRequested");
    expect(source).toContain("munckRequested");
    expect(source).toContain("Copiar resumo");
    expect(source).toContain("Conta Azul");
  });

  it("does not expose Quote persistence actions from the estimator", () => {
    for (const action of [
      "SAVE_QUOTE",
      "GET_QUOTE",
      "GET_QUOTE_HISTORY",
      "GET_QUOTE_METRICS",
      "LIST_QUOTES",
      "TRANSITION_QUOTE",
    ])
      expect(source).not.toContain(action);

    expect(source).not.toContain("quoteRepository.save(");
    expect(source).not.toContain("quoteRepository.load(");
    expect(source).not.toContain("quoteRepository.history(");
    expect(source).not.toContain("quoteRepository.transition(");
  });

  it("blocks stale results after inputs change", () => {
    expect(source).toContain("currentFingerprint");
    expect(source).toContain("calculatedFingerprint");
    expect(source).toContain("freshResult");
    expect(source).toContain("Os dados foram alterados após o último cálculo");
    expect(source).toContain("disabled={!freshResult}");
  });

  it("does not render internal costing or pricing details", () => {
    expect(source).not.toContain("totalCost");
    expect(source).not.toContain("unitVariableCost");
    expect(source).not.toContain("quoteItemFixedCost");
    expect(source).not.toContain("pricingEngine");
    expect(source).not.toContain("financialRate");
    expect(source).not.toContain("markup");
  });
});
