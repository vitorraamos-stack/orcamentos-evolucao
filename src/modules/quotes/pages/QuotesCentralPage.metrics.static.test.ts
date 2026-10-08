import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/modules/quotes/pages/QuotesCentralPage.tsx",
  "utf8"
).replaceAll("\r\n", "\n");

describe("QuotesCentralPage commercial funnel 18M", () => {
  it("renders aggregate funnel metrics from the dedicated endpoint", () => {
    expect(source).toMatch(/quoteRepository\s*\.\s*metrics\(\)/);
    expect(source).toContain("Taxa de fechamento");
    expect(source).toContain("Aceitos ÷ decisões comerciais");
    expect(source).toContain("Motivos de perda");
    expect(source).toContain("rejectedWithoutReason");
  });

  it("does not render sensitive commercial outcome notes", () => {
    expect(source).not.toContain("outcomeReason.note");
    expect(source).not.toContain("reason_note");
    expect(source).not.toContain("minimumAllowedTotal");
  });
});
