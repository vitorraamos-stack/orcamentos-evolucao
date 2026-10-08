import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Orçamentista UI boundary 19A", () => {
  it("keeps only the intelligent estimator as the active commercial route", () => {
    const app = read("src/App.tsx");
    const layout = read("src/components/Layout.tsx");

    expect(app).toContain('path="/orcamentista"');
    expect(app).toContain("<QuoteCalculatorPage />");

    expect(app).not.toContain(
      'import QuotesCentralPage from "@/modules/quotes/pages/QuotesCentralPage"'
    );
    expect(app).not.toContain(
      'import QuoteProposalPage from "@/modules/quotes/pages/QuoteProposalPage"'
    );

    expect(layout).toContain('href="/orcamentista"');
    expect(layout).toContain("Orçamentista");
    expect(layout).not.toContain("Novo orçamento");
    expect(layout).not.toContain("Orçamentos");
  });

  it("redirects legacy Quote-management URLs back to the estimator", () => {
    const app = read("src/App.tsx");

    expect(app).toContain('path="/orcamentos"');
    expect(app).toContain('path="/orcamentos/:quoteId/proposta"');
    expect(app).toContain('<Redirect to="/orcamentista" />');
    expect(app).not.toContain("<QuotesCentralPage />");
    expect(app).not.toContain("<QuoteProposalPage />");
  });
});
