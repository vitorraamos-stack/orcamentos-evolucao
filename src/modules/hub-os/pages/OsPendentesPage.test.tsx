import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const source = readFileSync(
  new URL("./OsPendentesPage.tsx", import.meta.url),
  "utf8"
);
describe("OsPendentesPage", () => {
  it("is a commercial-action center preserving all three actions", () => {
    expect(source).toContain("Pendências Financeiras");
    expect(source).toContain("uploadReceiptForOrder");
    expect(source).toContain('status: "PENDING_REVIEW"');
    expect(source).not.toContain('fetchFinanceQueue(["PENDING_REVIEW"]');
    expect(source).toContain("Abrir OS");
  });
});
