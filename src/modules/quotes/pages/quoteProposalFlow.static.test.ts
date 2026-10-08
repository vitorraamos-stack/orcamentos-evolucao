import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Quote proposal UI is outside the estimator scope 19A", () => {
  it("does not register the persisted proposal page in the application", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    const calculator = readFileSync(
      "src/modules/quotes/pages/QuoteCalculatorPage.tsx",
      "utf8"
    );

    expect(app).not.toContain("<QuoteProposalPage />");
    expect(app).not.toContain(
      'import QuoteProposalPage from "@/modules/quotes/pages/QuoteProposalPage"'
    );
    expect(calculator).not.toContain("/proposta");
    expect(calculator).not.toContain("Proposta comercial");
  });
});
