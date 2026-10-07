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

const dbWithProduct = () => ({
  from: (table: string) => {
    if (table === "products")
      return query({
        data: [{ id: id(1), code: "LETREIRO_PVC", name: "Letreiro em PVC" }],
        error: null,
      });
    if (table === "product_versions")
      return query({
        data: { id: id(2), version_number: 2 },
        error: null,
      });
    throw new Error(`unexpected table ${table}`);
  },
});

const definition = {
  inputs: [
    { id: id(3), key: "width", label: "Largura", required: true, sortOrder: 0, type: "DECIMAL", unit: "m", min: "0.01" },
    { id: id(4), key: "height", label: "Altura", required: true, sortOrder: 1, type: "DECIMAL", unit: "m", min: "0.01" },
    { id: id(5), key: "number_of_colors", label: "Número de cores", required: true, sortOrder: 2, type: "DECIMAL", unit: null, defaultValue: "0" },
    { id: id(6), key: "paint_coats", label: "Demãos", required: true, sortOrder: 3, type: "DECIMAL", unit: null },
  ],
};

const pricing = {
  loadOfficialCalculationContext: async () => ({}),
  loadInstallationSettings: async () => ({ revision: 1 }),
  loadPaymentTerm: async (installments: number) => {
    if (installments === 6) return { installments, rate: "0.05" };
    throw new PricingPersistenceServiceError(
      404,
      "PRICING_PAYMENT_TERM_NOT_FOUND",
      "not found"
    );
  },
};

describe("OfficialQuoteFormService", () => {
  it("exposes only client-editable inputs and configured installments", async () => {
    const productEngineering = {
      loadDefinition: async () => definition,
    } as any;
    const costing = {
      loadProductParameters: async () => [
        { key: "paint_coats" },
        { key: "paint_yield_m2_per_can_per_coat" },
      ],
    } as any;

    const result = await new OfficialQuoteFormService(
      dbWithProduct(),
      productEngineering,
      costing,
      pricing as any
    ).load();

    expect(result.availableInstallments).toEqual([1, 2, 3, 6]);
    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toMatchObject({
      code: "LETREIRO_PVC",
      productVersionNumber: 2,
      installationAvailable: true,
      munckAvailable: true,
      calculationAvailable: true,
    });
    expect(result.products[0].inputs.map(input => input.key)).toEqual([
      "width",
      "height",
      "number_of_colors",
    ]);
  });

  it("keeps installation available when a dimension is server-managed", async () => {
    const result = await new OfficialQuoteFormService(
      dbWithProduct(),
      { loadDefinition: async () => definition } as any,
      {
        loadProductParameters: async () => [
          { key: "width" },
          { key: "paint_coats" },
        ],
      } as any,
      pricing as any
    ).load();

    expect(result.products[0].installationAvailable).toBe(true);
    expect(result.products[0].inputs.map(input => input.key)).not.toContain(
      "width"
    );
  });

  it("includes a requested historical product version in read-only mode", async () => {
    const historicalDb = {
      from: (table: string) => {
        if (table === "products") {
          let idLookup = false;
          const chain: any = {
            select: () => chain,
            eq: (column: string) => {
              if (column === "id") idLookup = true;
              return chain;
            },
            order: () => chain,
            maybeSingle: async () =>
              idLookup
                ? {
                    data: {
                      id: id(1),
                      code: "LETREIRO_PVC",
                      name: "Letreiro em PVC",
                      status: "ACTIVE",
                    },
                    error: null,
                  }
                : { data: null, error: null },
            then: (resolve: (value: unknown) => void) =>
              resolve(
                idLookup
                  ? { data: null, error: null }
                  : { data: [], error: null }
              ),
          };
          return chain;
        }
        if (table === "product_versions") {
          let directLookup = false;
          const chain: any = {
            select: () => chain,
            eq: (column: string) => {
              if (column === "id") directLookup = true;
              return chain;
            },
            order: () => chain,
            limit: () => chain,
            in: () => chain,
            maybeSingle: async () =>
              directLookup
                ? {
                    data: {
                      id: id(7),
                      product_id: id(1),
                      version_number: 1,
                      status: "RETIRED",
                    },
                    error: null,
                  }
                : { data: null, error: null },
          };
          return chain;
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const result = await new OfficialQuoteFormService(
      historicalDb,
      { loadDefinition: async () => definition } as any,
      { loadProductParameters: async () => [] } as any,
      pricing as any
    ).load(id(7));

    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toMatchObject({
      productVersionId: id(7),
      productVersionNumber: 1,
      calculationAvailable: false,
    });
  });

  it("restricts direct historical lookup to versions that were published", async () => {
    let requestedStatuses: string[] | null = null;
    const restrictedDb = {
      from: (table: string) => {
        if (table === "products") return query({ data: [], error: null });
        if (table === "product_versions") {
          const chain: any = {
            select: () => chain,
            eq: () => chain,
            in: (column: string, values: string[]) => {
              if (column === "status") requestedStatuses = values;
              return chain;
            },
            order: () => chain,
            limit: () => chain,
            maybeSingle: async () => ({ data: null, error: null }),
          };
          return chain;
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const result = await new OfficialQuoteFormService(
      restrictedDb,
      { loadDefinition: async () => definition } as any,
      { loadProductParameters: async () => [] } as any,
      pricing as any
    ).load(id(8));

    expect(requestedStatuses).toEqual(["PUBLISHED", "RETIRED"]);
    expect(result.products).toEqual([]);
  });

  it("does not advertise a product whose Pricing cannot calculate", async () => {
    const unavailablePricing = {
      ...pricing,
      loadOfficialCalculationContext: async () => {
        throw new PricingPersistenceServiceError(
          409,
          "PRICING_POLICY_NOT_ACTIVE",
          "inactive"
        );
      },
    };

    const result = await new OfficialQuoteFormService(
      dbWithProduct(),
      { loadDefinition: async () => definition } as any,
      { loadProductParameters: async () => [] } as any,
      unavailablePricing as any
    ).load();

    expect(result.products).toEqual([]);
  });
});
