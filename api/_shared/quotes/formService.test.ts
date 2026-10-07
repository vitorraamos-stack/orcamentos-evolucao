import { describe, expect, it } from "vitest";
import {
  PricingPersistenceServiceError,
} from "../pricing/service.js";
import { OfficialQuoteFormService } from "./formService";

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const query = (result: unknown) => {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => result,
    then: (resolve: (value: unknown) => void) => resolve(result),
  };
  return chain;
};

describe("OfficialQuoteFormService", () => {
  it("exposes only client-editable inputs and configured installments", async () => {
    const db = {
      from: (table: string) => {
        if (table === "products")
          return query({
            data: [{ id: id(1), code: "LETREIRO_PVC", name: "Letreiro em PVC" }],
            error: null,
          });
        if (table === "product_pricing_settings")
          return query({ data: [{ product_id: id(1) }], error: null });
        if (table === "product_versions")
          return query({
            data: { id: id(2), version_number: 2 },
            error: null,
          });
        throw new Error(`unexpected table ${table}`);
      },
    };
    const productEngineering = {
      loadDefinition: async () => ({
        inputs: [
          { id: id(3), key: "width", label: "Largura", required: true, sortOrder: 0, type: "DECIMAL", unit: "m", min: "0.01" },
          { id: id(4), key: "height", label: "Altura", required: true, sortOrder: 1, type: "DECIMAL", unit: "m", min: "0.01" },
          { id: id(5), key: "number_of_colors", label: "Número de cores", required: true, sortOrder: 2, type: "DECIMAL", unit: null, defaultValue: "0" },
          { id: id(6), key: "paint_coats", label: "Demãos", required: true, sortOrder: 3, type: "DECIMAL", unit: null },
        ],
      }),
    } as any;
    const costing = {
      loadProductParameters: async () => [
        { key: "paint_coats" },
        { key: "paint_yield_m2_per_can_per_coat" },
      ],
    } as any;
    const pricing = {
      loadInstallationSettings: async () => ({ revision: 1 }),
      loadPaymentTerm: async (installments: number) => {
        if (installments === 6) return { installments, rate: "0.05" };
        throw new PricingPersistenceServiceError(
          404,
          "PRICING_PAYMENT_TERM_NOT_FOUND",
          "not found"
        );
      },
    } as any;

    const result = await new OfficialQuoteFormService(
      db,
      productEngineering,
      costing,
      pricing
    ).load();

    expect(result.availableInstallments).toEqual([1, 2, 3, 6]);
    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toMatchObject({
      code: "LETREIRO_PVC",
      productVersionNumber: 2,
      installationAvailable: true,
    });
    expect(result.products[0].inputs.map(input => input.key)).toEqual([
      "width",
      "height",
      "number_of_colors",
    ]);
  });
});
