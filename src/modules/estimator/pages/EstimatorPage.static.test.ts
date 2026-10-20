import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/modules/estimator/pages/EstimatorPage.tsx",
  "utf8"
);

describe("EstimatorPage re-scope 19A", () => {
  it("keeps the official calculation flow and reviewed Conta Azul copy", () => {
    expect(source).toContain(".loadForm()");
    expect(source).toContain("estimatorRepository.calculate(request)");
    expect(source).toContain("buildTechnicalInputs(");
    expect(source).toContain("availableInstallments");
    expect(source).toContain("installationRequested");
    expect(source).toContain("munckRequested");
    expect(source).toContain("Copiar para Conta Azul");
    expect(source).toContain("buildContaAzulTransfer(result, product, technicalLines)");
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

    expect(source).not.toContain("estimatorRepository.save(");
    expect(source).not.toContain("estimatorRepository.load(");
    expect(source).not.toContain("estimatorRepository.history(");
    expect(source).not.toContain("estimatorRepository.transition(");
  });

  it("blocks stale results after inputs change", () => {
    expect(source).toContain("currentFingerprint");
    expect(source).toContain("calculatedFingerprint");
    expect(source).toContain("freshResult");
    expect(source).toContain("Os dados foram alterados após o último cálculo");
    expect(source).toContain("if (!contaAzulTransfer || !freshResult || !transferReview || working) return;");
    expect(source).toContain("disabled={!transferReview || working}");
    expect(source).toContain("setTransferReview(false)");
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
