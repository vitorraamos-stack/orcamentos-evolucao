import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/modules/quotes/pages/QuoteCalculatorPage.tsx",
  "utf8"
).replaceAll("\r\n", "\n");

describe("QuoteCalculatorPage history 18K", () => {
  it("renders a sanitized timeline and reloads it by Quote revision", () => {
    expect(source).toMatch(
      /quoteRepository\s*\.\s*history\(saved\.quoteId\)/
    );
    expect(source).toMatch(
      /\[\s*saved\?\.quoteId,\s*saved\?\.revision\s*\]/
    );
    expect(source).toMatch(/>\s*Histórico\s*</);
    expect(source).toContain("Ajuste gerencial");
    expect(source).toContain("item.totalSellingPrice.amount");
    expect(source).not.toContain("item.minimumAllowedTotal");
    expect(source).not.toContain("item.payload");
    expect(source).not.toContain("item.negotiationPrivateSnapshot");
  });
});
