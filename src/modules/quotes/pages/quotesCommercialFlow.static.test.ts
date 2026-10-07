import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(path, "utf8").replaceAll("\r\n", "\n");

describe("Quote commercial flow", () => {
  it("keeps commercial identity and reopen flow wired", () => {
    const calculator = read(
      "src/modules/quotes/pages/QuoteCalculatorPage.tsx"
    );
    expect(calculator).toContain("Cliente e referência");
    expect(calculator).toContain("quoteRepository.load(");
    expect(calculator).toContain("quoteRepository.loadForm(");
    expect(calculator).toContain("calculationAvailable");
    expect(calculator).toContain('url.searchParams.set("quote"');
  });

  it("exposes a searchable Quote central without private pricing data", () => {
    const central = read(
      "src/modules/quotes/pages/QuotesCentralPage.tsx"
    );
    expect(central).toContain("quoteRepository");
    expect(central).toContain(".list({");
    expect(central).toContain("Número, cliente, telefone ou título");
    expect(central).toContain("/orcamentista?quote=");
    for (const forbidden of [
      "privateSnapshot",
      "pricingEngine",
      "totalCost",
      "financialRate",
      "markup",
    ])
      expect(central).not.toContain(forbidden);
  });

  it("registers central and new-quote navigation", () => {
    const app = read("src/App.tsx");
    const layout = read("src/components/Layout.tsx");
    expect(app).toContain('path="/orcamentos"');
    expect(app).toContain("<QuotesCentralPage />");
    expect(layout).toContain("Orçamentos");
    expect(layout).toContain("Novo orçamento");
  });
});
