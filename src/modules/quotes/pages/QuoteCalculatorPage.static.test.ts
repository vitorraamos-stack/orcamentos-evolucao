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
});
