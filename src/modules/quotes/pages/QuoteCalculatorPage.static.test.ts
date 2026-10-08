import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/modules/quotes/pages/QuoteCalculatorPage.tsx",
  "utf8"
).replaceAll("\r\n", "\n");

describe("QuoteCalculatorPage stale result guard", () => {
  it("blocks copying a result after quote inputs change", () => {
    expect(source).toContain(
      "if (!displayedResult || !product || !freshResult) return;"
    );
    expect(source).toContain(
      'disabled={!freshResult}\n                    onClick={() => void copySummary()}'
    );
  });

  it("keeps manager negotiation gated and the protected floor private", () => {
    expect(source).toContain("hubPermissions.isManager");
    expect(source).toContain("Negociação gerencial");
    expect(source).toContain("quoteNegotiationRequestSchema.parse");
    expect(source).toContain('"MANAGER_FINAL_PRICE"');
    expect(source).toContain('"BELOW_MINIMUM_OVERRIDE_REQUIRED"');
    expect(source).toContain("Confirmar exceção comercial");
    expect(source).toContain("void save(true)");
    expect(source).toContain("managerAdjustedLock");
    expect(source).not.toContain("minimumAllowedTotal");
    expect(source).not.toContain("minimum_allowed_total");
  });
});
