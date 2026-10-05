import { describe, expect, it } from "vitest";
import { decimalString, multiplyDecimal } from "../calculation-engine/index.js";
import { productVersionDefinitionSchema } from "../product-engineering/index.js";
import {
  aggregateCosting,
  CostingDomainError,
  type CostingAggregationInput,
} from "./index.js";

const ids = {
  product: "10000000-0000-4000-8000-000000000001",
  version: "10000000-0000-4000-8000-000000000002",
  user: "10000000-0000-4000-8000-000000000003",
  component: "10000000-0000-4000-8000-000000000004",
  resource: "10000000-0000-4000-8000-000000000005",
  rate: "10000000-0000-4000-8000-000000000006",
  input: "10000000-0000-4000-8000-000000000007",
};

function fixture(
  scope: "PER_UNIT" | "PER_QUOTE_ITEM" = "PER_UNIT",
  quantity = "2",
  rate = "5"
): CostingAggregationInput {
  return {
    productDefinition: productVersionDefinitionSchema.parse({
      schemaVersion: "1.0",
      version: {
        id: ids.version,
        productId: ids.product,
        versionNumber: 1,
        revision: 2,
        status: "PUBLISHED",
        createdAt: "2026-01-01T00:00:00Z",
        createdBy: ids.user,
        publishedAt: "2026-01-02T00:00:00Z",
        publishedBy: ids.user,
      },
      inputs: [],
      variables: [],
      components: [
        {
          id: ids.component,
          type: "MATERIAL",
          materialId: ids.resource,
          label: "Fictitious material",
          sortOrder: 0,
          quantityScope: scope,
          quantityExpression: {
            type: "decimal_literal",
            value: decimalString(quantity),
            unit: "un",
          },
          quantityUnit: "un",
        },
      ],
    }),
    request: { commercialQuantity: decimalString("3"), technicalInputs: {} },
    resources: [
      {
        definition: {
          id: ids.resource as never,
          type: "MATERIAL",
          code: "TEST",
          name: "Test",
          description: "",
          status: "ACTIVE",
          costUnit: "un",
        },
        rates: [
          {
            id: ids.rate as never,
            type: "MATERIAL",
            materialId: ids.resource as never,
            amount: decimalString(rate),
            currency: "BRL",
            unit: "un",
            effectiveFrom: "2026-01-01T00:00:00Z",
            effectiveTo: null,
          },
        ],
      },
    ],
    effectiveCostAt: "2026-02-01T00:00:00Z",
  };
}

describe("aggregateCosting", () => {
  it("expands PER_UNIT exactly once", () => {
    const result = aggregateCosting(fixture());
    expect(result.unitVariableCost.amount).toBe("10");
    expect(result.quoteItemFixedCost.amount).toBe("0");
    expect(result.totalCost.amount).toBe("30");
    expect(result.components[0]).toMatchObject({
      baseCost: { amount: "10" },
      expandedCostQuantity: { amount: "6", unit: "un" },
    });
  });

  it("does not expand PER_QUOTE_ITEM", () => {
    const result = aggregateCosting(fixture("PER_QUOTE_ITEM"));
    expect(result.unitVariableCost.amount).toBe("0");
    expect(result.quoteItemFixedCost.amount).toBe("10");
    expect(result.totalCost.amount).toBe("10");
    expect(result.components[0].expandedCostQuantity?.amount).toBe("2");
  });

  it("retains arbitrary Decimal precision", () => {
    const quantity = decimalString("0.12345678901234567890123456789");
    const rate = decimalString("12345678901234567890.12345678901234567890");
    const result = aggregateCosting(fixture("PER_QUOTE_ITEM", quantity, rate));
    expect(result.totalCost.amount).toBe(multiplyDecimal(quantity, rate));
  });

  it("accepts fractional commercial quantities", () => {
    const input: any = fixture();
    input.request = {
      ...input.request,
      commercialQuantity: decimalString("2.5"),
    };
    expect(aggregateCosting(input).totalCost.amount).toBe("25");
  });

  it("skips resource/rate lookup when the condition is false", () => {
    const input: any = fixture();
    input.productDefinition.components[0].condition = {
      type: "boolean_literal",
      value: false,
    };
    input.resources = [];
    const result = aggregateCosting(input);
    expect(result.components[0]).toMatchObject({
      included: false,
      conditionResult: false,
      totalCostContribution: { amount: "0" },
    });
  });

  it("rejects non-published versions and invalid commercial quantities", () => {
    const draft: any = fixture();
    draft.productDefinition.version = {
      ...draft.productDefinition.version,
      status: "DRAFT",
      publishedAt: null,
      publishedBy: null,
    };
    expect(() => aggregateCosting(draft)).toThrowError(CostingDomainError);
    const invalid: any = fixture();
    invalid.request = {
      ...invalid.request,
      commercialQuantity: decimalString("0"),
    };
    expect(() => aggregateCosting(invalid)).toThrowError(
      expect.objectContaining({ code: "INVALID_COMMERCIAL_QUANTITY" })
    );
  });

  it("normalizes scalar defaults and provided physical units", () => {
    const input: any = fixture();
    input.productDefinition.inputs = [
      {
        id: ids.input as never,
        key: "factor",
        label: "Factor",
        required: true,
        sortOrder: 0,
        type: "DECIMAL",
        unit: null,
        defaultValue: decimalString("1.25"),
      },
      {
        id: "10000000-0000-4000-8000-000000000008" as never,
        key: "length",
        label: "Length",
        required: true,
        sortOrder: 1,
        type: "DECIMAL",
        unit: "m",
      },
    ];
    input.request = {
      ...input.request,
      technicalInputs: {
        length: { kind: "decimal", value: decimalString("100"), unit: "cm" },
      },
    };
    expect(aggregateCosting(input).resolvedInputs).toEqual([
      {
        key: "factor",
        source: "DEFAULT",
        value: { kind: "decimal", value: "1.25", unit: null },
      },
      {
        key: "length",
        source: "PROVIDED",
        value: { kind: "decimal", value: "1", unit: "m" },
      },
    ]);
  });
});
