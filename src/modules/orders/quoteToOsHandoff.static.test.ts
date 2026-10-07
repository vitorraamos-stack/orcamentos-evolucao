import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(path, "utf8").replaceAll("\\r\\n", "\\n");

describe("Quote → OS handoff 18E", () => {
  it("offers OS creation only from an accepted persisted Quote", () => {
    const quotePage = read("src/modules/quotes/pages/QuoteCalculatorPage.tsx");
    expect(quotePage).toContain('saved.status === "ACCEPTED"');
    expect(quotePage).toContain("createOrderFromQuotePath(");
    expect(quotePage).toContain("Criar OS a partir deste orçamento");
  });

  it("loads the exact Quote, redirects existing conversions and builds prefill", () => {
    const page = read("src/modules/orders/pages/CreateOrderPage.tsx");
    expect(page).toContain('quote.status !== "ACCEPTED"');
    expect(page).toContain("findOrderByQuoteId(quoteId)");
    expect(page).toContain("buildQuoteOrderPrefill(quote, product)");
    expect(page).toContain("setLocation(");
    expect(page).toContain("existing.id");
    expect(page).toContain("sourceLoading || (quoteParam && !source && !sourceError)");
  });

  it("locks Quote-derived fields and uses the idempotent conversion RPC", () => {
    const form = read("src/features/hubos/components/CreateOrderForm.tsx");
    const api = read("src/features/hubos/api.ts");
    expect(form).toContain("const quoteLocked = Boolean(sourceQuoteId)");
    expect(form).toContain("disabled={quoteLocked}");
    expect(form).toContain("disabled={installationLocked}");
    expect(form).toContain("createOrderFromQuote(sourceQuoteId, payload)");
    expect(form).toContain("if (draft && sourceQuoteId)");
    expect(api).toContain('"hub_os_create_from_quote_secure"');
    expect(api).toContain('.eq("quote_id", quoteId)');
  });

  it("keeps the new runtime contract in preflight", () => {
    const preflight = read("tools/preflight/check-runtime-contracts.mjs");
    expect(preflight).toContain("'hub_os_create_from_quote_secure'");
  });
});
