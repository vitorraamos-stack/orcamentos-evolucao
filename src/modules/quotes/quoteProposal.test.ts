import { describe, expect, it } from "vitest";
import type {
  QuoteCurrentPublicResult,
  QuoteFormProduct,
} from "@shared/quotes";
import {
  buildQuoteProposalData,
  buildQuoteProposalPrintHtml,
} from "./quoteProposal";

const quote = {
  quoteId: "11111111-1111-4111-8111-111111111111",
  quoteNumber: 42,
  status: "SENT",
  revision: 2,
  snapshotId: "22222222-2222-4222-8222-222222222222",
  snapshotVersion: 2,
  savedAt: "2026-10-08T10:00:00.000Z",
  commercial: {
    customerName: "Cliente <Teste>",
    customerPhone: "(48) 99999-0000",
    title: "Letreiro & fachada",
  },
  request: {
    productVersionId: "33333333-3333-4333-8333-333333333333",
    request: {
      commercialQuantity: "2.000",
      technicalInputs: {
        width: { kind: "decimal", value: "1.500", unit: "m" },
        illuminated: { kind: "boolean", value: true },
        finish: { kind: "string", value: "matte" },
        note: { kind: "string", value: "Teste <script>" },
      },
    },
    installments: 3,
    installation: { requested: true },
    munck: { requested: false },
  },
  negotiation: {
    pricingMode: "MANAGER_ADJUSTED",
    totalSellingPrice: { currency: "BRL", amount: "1125.00" },
  },
  publicResult: {
    calculationVersion: "1.0",
    productId: "44444444-4444-4444-8444-444444444444",
    productVersionId: "33333333-3333-4333-8333-333333333333",
    productVersionNumber: 7,
    productVersionRevision: 1,
    commercialQuantity: "2.000",
    installments: 3,
    productSellingPrice: { currency: "BRL", amount: "1000.00" },
    installation: {
      requested: true,
      areaM2: "1.50",
      tier: "TIER_2",
      price: { currency: "BRL", amount: "180.00" },
    },
    munck: {
      requested: false,
      requestedHours: null,
      billedHours: null,
      price: { currency: "BRL", amount: "0" },
    },
    subtotalBeforeFinancialRate: { currency: "BRL", amount: "1180.00" },
    roundingRule: "BRL_2DP_HALF_UP_V1",
    totalSellingPrice: { currency: "BRL", amount: "1180.00" },
  },
} as QuoteCurrentPublicResult;

const product = {
  productId: "44444444-4444-4444-8444-444444444444",
  code: "LETREIRO",
  name: "Letreiro PVC",
  productVersionId: "33333333-3333-4333-8333-333333333333",
  productVersionNumber: 7,
  inputs: [
    {
      id: "55555555-5555-4555-8555-555555555551",
      key: "width",
      label: "Largura",
      required: true,
      sortOrder: 0,
      type: "DECIMAL",
      unit: "m",
    },
    {
      id: "55555555-5555-4555-8555-555555555552",
      key: "illuminated",
      label: "Iluminado",
      required: false,
      sortOrder: 1,
      type: "BOOLEAN",
    },
    {
      id: "55555555-5555-4555-8555-555555555553",
      key: "finish",
      label: "Acabamento",
      required: true,
      sortOrder: 2,
      type: "SELECT",
      options: [
        { value: "matte", label: "Fosco" },
        { value: "gloss", label: "Brilho" },
      ],
    },
    {
      id: "55555555-5555-4555-8555-555555555554",
      key: "note",
      label: "Observação",
      required: false,
      sortOrder: 3,
      type: "TEXT",
    },
  ],
  installationAvailable: true,
  munckAvailable: true,
  calculationAvailable: true,
} as QuoteFormProduct;

describe("Quote proposal 18F", () => {
  it("maps only public persisted Quote fields into the proposal", () => {
    const data = buildQuoteProposalData(quote, product);

    expect(data.quoteNumber).toBe(42);
    expect(data.quantity).toBe("2");
    expect(data.total).toBe("1125.00");
    expect(data.installation.areaM2).toBe("1,5");
    expect(data.specs).toEqual([
      { label: "Largura", value: "1,5 m" },
      { label: "Iluminado", value: "Sim" },
      { label: "Acabamento", value: "Fosco" },
      { label: "Observação", value: "Teste <script>" },
    ]);
  });

  it("builds an A4 print document and escapes commercial/user text", () => {
    const html = buildQuoteProposalPrintHtml(
      buildQuoteProposalData(quote, product),
      "https://example.com/logo.png"
    );

    expect(html).toContain("@page { size: A4");
    expect(html).toContain("Proposta Comercial");
    expect(html).toContain("Cliente &lt;Teste&gt;");
    expect(html).toContain("Letreiro &amp; fachada");
    expect(html).toContain("Teste &lt;script&gt;");
    expect(html).not.toContain("Cliente <Teste>");
    expect(html).not.toContain("Teste <script>");
    expect(html).not.toContain("Snapshot");
    expect(html).not.toContain("Versão técnica");
    expect(html).not.toContain("markup");
    expect(html).not.toContain("custos internos");
  });

  it("never needs private costing or markup fields", () => {
    const serialized = JSON.stringify(buildQuoteProposalData(quote, product));
    expect(serialized).not.toContain("markup");
    expect(serialized).not.toContain("cost");
    expect(serialized).not.toContain("financialRate");
  });
});
