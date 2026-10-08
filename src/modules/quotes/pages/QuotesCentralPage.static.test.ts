import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/modules/quotes/pages/QuotesCentralPage.tsx",
  "utf8"
).replaceAll("\r\n", "\n");

describe("QuotesCentralPage negotiation visibility", () => {
  it("shows only the sanitized manager-adjustment marker", () => {
    expect(source).toContain('item.pricingMode === "MANAGER_ADJUSTED"');
    expect(source).toContain("Ajuste gerencial");
    expect(source).toContain("item.totalSellingPrice.amount");
    expect(source).not.toContain("minimumAllowedTotal");
    expect(source).not.toContain("minimum_allowed_total");
    expect(source).not.toContain("negotiationPrivateSnapshot");
    expect(source).not.toContain("negotiation_private_snapshot");
  });
});
