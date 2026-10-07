import { describe, expect, it } from "vitest";
import { buildQuoteOrderPrefill } from "./quoteOrderPrefill";

const id = (digit: number) =>
  `${digit.toString().padStart(8, "0")}-0000-4000-8000-000000000000`;

const baseQuote = {
  quoteId: id(1),
  quoteNumber: 1042,
  status: "ACCEPTED",
  revision: 3,
  snapshotId: id(2),
  snapshotVersion: 2,
  savedAt: "2026-10-07T12:00:00.000Z",
  commercial: {
    customerName: "Cliente Teste",
    customerPhone: "48999999999",
    title: "Letreiro recepção",
  },
  request: {
    productVersionId: id(4),
    request: {
      commercialQuantity: "2",
      technicalInputs: {
        width: { kind: "decimal", value: "1.2", unit: "m" },
        height: { kind: "decimal", value: "850", unit: "mm" },
      },
    },
    installments: 3,
    installation: { requested: true },
    munck: { requested: true, hours: "4" },
  },
  publicResult: {
    calculationVersion: "1.0",
    productId: id(3),
    productVersionId: id(4),
    productVersionNumber: 2,
    productVersionRevision: 1,
    commercialQuantity: "2",
    installments: 3,
    productSellingPrice: { currency: "BRL", amount: "1740.00" },
    installation: {
      requested: true,
      areaM2: "2.04",
      tier: "TIER_3",
      price: { currency: "BRL", amount: "200.00" },
    },
    munck: {
      requested: true,
      requestedHours: "4",
      billedHours: "4",
      price: { currency: "BRL", amount: "1500.00" },
    },
    subtotalBeforeFinancialRate: { currency: "BRL", amount: "3440.00" },
    roundingRule: "HALF_UP_2",
    totalSellingPrice: { currency: "BRL", amount: "3440.00" },
  },
} as any;

const product = {
  productId: id(3),
  code: "LETREIRO_PVC",
  name: "Letreiro em PVC",
  productVersionId: id(4),
  productVersionNumber: 2,
  inputs: [],
  installationAvailable: true,
  munckAvailable: true,
  calculationAvailable: true,
} as any;

describe("Quote → OS prefill", () => {
  it("prefills commercial identity, item, quantity and dimensions", () => {
    const prefill = buildQuoteOrderPrefill(baseQuote, product);

    expect(prefill).toMatchObject({
      saleNumber: "",
      clientName: "Cliente Teste",
      description: "Orçamento #1042 — Letreiro recepção",
      deliveryDeadlinePreset: null,
      logisticType: "instalacao",
      address: "",
      selectedArtDirectionTag: null,
      items: [
        {
          name: "Letreiro em PVC",
          quantity: 2,
          width_cm: 120,
          height_cm: 85,
          measurement_unit: "cm",
          unit: "un",
        },
      ],
    });
    expect(prefill.items[0]?.notes).toContain("Orçamento #1042");
    expect(prefill.items[0]?.notes).toContain("Inclui instalação");
    expect(prefill.items[0]?.notes).toContain("Munck previsto: 4h");
  });

  it("defaults non-installation quotes to pickup without inventing deadlines", () => {
    const prefill = buildQuoteOrderPrefill(
      {
        ...baseQuote,
        request: {
          ...baseQuote.request,
          installation: { requested: false },
          munck: { requested: false },
        },
      },
      product
    );

    expect(prefill.logisticType).toBe("retirada");
    expect(prefill.deliveryDeadlinePreset).toBeNull();
    expect(prefill.selectedArtDirectionTag).toBeNull();
  });
});
