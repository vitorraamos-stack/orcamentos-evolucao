import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/modules/quotes/pages/QuoteCalculatorPage.tsx",
  "utf8"
).replaceAll("\r\n", "\n");

describe("QuoteCalculatorPage history 18K", () => {
  it("renders a sanitized timeline and reloads it by Quote revision", () => {
    expect(source).toContain("quoteRepository.history(saved.quoteId)");
    expect(source).toContain("[saved?.quoteId, saved?.revision]");
    expect(source).toContain(">Histórico<");
    expect(source).toContain("Ajuste gerencial");
    expect(source).toContain("item.totalSellingPrice.amount");
    expect(source).not.toContain("item.minimumAllowedTotal");
    expect(source).not.toContain("item.payload");
    expect(source).not.toContain("item.negotiationPrivateSnapshot");
  });
});
