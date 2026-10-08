import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(path, "utf8").replaceAll("\r\n", "\n");

describe("Quote commercial proposal flow 18F", () => {
  it("registers the authenticated proposal route", () => {
    const app = read("src/App.tsx");
    expect(app).toContain('path="/orcamentos/:quoteId/proposta"');
    expect(app).toContain("<QuoteProposalPage />");
    expect(app).toContain('moduleKey="calculadora"');
  });

  it("opens proposals from the Central and the persisted Quote screen", () => {
    const central = read(
      "src/modules/quotes/pages/QuotesCentralPage.tsx"
    );
    const calculator = read(
      "src/modules/quotes/pages/QuoteCalculatorPage.tsx"
    );
    expect(central).toContain(
      "/orcamentos/${item.quoteId}/proposta"
    );
    expect(calculator).toContain(
      "/orcamentos/${saved.quoteId}/proposta"
    );
    expect(calculator).toContain(
      "disabled={working || !persistedStateIsCurrent}"
    );
  });

  it("loads the persisted Quote and historical product version", () => {
    const page = read(
      "src/modules/quotes/pages/QuoteProposalPage.tsx"
    );
    expect(page).toContain("quoteRepository.load(parsedQuoteId)");
    expect(page).toContain(
      "quoteRepository.loadForm("
    );
    expect(page).toContain(
      "quote.request.productVersionId"
    );
    expect(page).toContain("buildQuoteProposalPrintHtml(");
  });
});
