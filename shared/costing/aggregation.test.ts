import { describe, expect, it } from "vitest";
import {
  decimalString,
  multiplyDecimal,
  type TechnicalInputValue,
} from "../calculation-engine/index.js";
import type { Expression } from "../calculation-engine/expressions/index.js";
import {
  productVersionDefinitionSchema,
  type ProductComponent,
  type ProductInput,
  type ProductVariable,
} from "../product-engineering/index.js";
import {
  aggregateCosting,
  costingAggregationInputSchema,
  costingResourceBundleSchema,
  CostingDomainError,
  type CostingAggregationInput,
  type CostingResourceBundle,
} from "./index.js";

const ids = {
  product: "10000000-0000-4000-8000-000000000001",
  version: "10000000-0000-4000-8000-000000000002",
  user: "10000000-0000-4000-8000-000000000003",
  component: "10000000-0000-4000-8000-000000000004",
  resource: "10000000-0000-4000-8000-000000000005",
  rate: "10000000-0000-4000-8000-000000000006",
  input: "10000000-0000-4000-8000-000000000007",
  secondComponent: "10000000-0000-4000-8000-000000000008",
  secondResource: "10000000-0000-4000-8000-000000000009",
  secondRate: "10000000-0000-4000-8000-000000000010",
  variable: "10000000-0000-4000-8000-000000000011",
};

const decimalLiteral = (
  value: string,
  unit: "un" | "m" | "cm" | "min"
): Expression => ({
  type: "decimal_literal",
  value: decimalString(value),
  unit,
});
const ref = (key: string): Expression => ({ type: "reference", key });

function component(
  overrides: Partial<ProductComponent> = {}
): ProductComponent {
  return {
    id: ids.component,
    type: "MATERIAL",
    materialId: ids.resource,
    label: "Material",
    sortOrder: 0,
    quantityScope: "PER_UNIT",
    quantityExpression: decimalLiteral("2", "un"),
    quantityUnit: "un",
    ...overrides,
  } as ProductComponent;
}

function bundle(
  overrides: {
    definition?: Partial<CostingResourceBundle["definition"]>;
    rates?: CostingResourceBundle["rates"];
  } = {}
): CostingResourceBundle {
  return costingResourceBundleSchema.parse({
    definition: {
      id: ids.resource,
      type: "MATERIAL",
      code: "TEST",
      name: "Test",
      description: "",
      status: "ACTIVE",
      costUnit: "un",
      ...overrides.definition,
    },
    rates: overrides.rates ?? [
      {
        id: ids.rate,
        type: "MATERIAL",
        materialId: ids.resource,
        amount: decimalString("5"),
        currency: "BRL",
        unit: "un",
        effectiveFrom: "2026-01-01T00:00:00Z",
        effectiveTo: null,
      },
    ],
  });
}

interface FixtureOptions {
  status?: "DRAFT" | "VALIDATING" | "PUBLISHED" | "RETIRED";
  components?: readonly ProductComponent[];
  inputs?: readonly ProductInput[];
  variables?: readonly ProductVariable[];
  technicalInputs?: Readonly<Record<string, TechnicalInputValue>>;
  resources?: readonly CostingResourceBundle[];
  commercialQuantity?: string;
}

function fixture(options: FixtureOptions = {}): CostingAggregationInput {
  const status = options.status ?? "PUBLISHED";
  const productDefinition = productVersionDefinitionSchema.parse({
    schemaVersion: "1.0",
    version: {
      id: ids.version,
      productId: ids.product,
      versionNumber: 1,
      revision: 2,
      status,
      createdAt: "2026-01-01T00:00:00Z",
      createdBy: ids.user,
      publishedAt:
        status === "PUBLISHED" || status === "RETIRED"
          ? "2026-01-02T00:00:00Z"
          : null,
      publishedBy:
        status === "PUBLISHED" || status === "RETIRED" ? ids.user : null,
    },
    inputs: options.inputs ?? [],
    variables: options.variables ?? [],
    components: options.components ?? [component()],
  });
  return costingAggregationInputSchema.parse({
    productDefinition,
    request: {
      commercialQuantity: decimalString(options.commercialQuantity ?? "3"),
      technicalInputs: options.technicalInputs ?? {},
    },
    resources: options.resources ?? [bundle()],
    effectiveCostAt: "2026-02-01T00:00:00Z",
  });
}

const runtimeInput = (value: unknown): CostingAggregationInput =>
  value as CostingAggregationInput;
const expectCode = (input: CostingAggregationInput, code: string): void => {
  expect(() => aggregateCosting(input)).toThrowError(
    expect.objectContaining({ code })
  );
};

describe("aggregateCosting boundary", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a primitive", "invalid"],
    ["an array", []],
  ])("rejects %s as the input envelope", (_name, malformed) => {
    expectCode(
      runtimeInput(malformed),
      "INVALID_COSTING_AGGREGATION_INPUT"
    );
  });

  it.each([
    ["productDefinition", "INVALID_PRODUCT_VERSION_DEFINITION"],
    ["request", "INVALID_COSTING_AGGREGATION_INPUT"],
    ["resources", "INVALID_COSTING_AGGREGATION_INPUT"],
    ["effectiveCostAt", "INVALID_COSTING_AGGREGATION_INPUT"],
  ] as const)("rejects a missing %s", (property, code) => {
    const { [property]: _omitted, ...malformed } = fixture();
    expectCode(runtimeInput(malformed), code);
  });

  it.each([
    ["productDefinition", null, "INVALID_PRODUCT_VERSION_DEFINITION"],
    ["request", null, "INVALID_COSTING_AGGREGATION_INPUT"],
    ["resources", null, "INVALID_COSTING_AGGREGATION_INPUT"],
    ["effectiveCostAt", null, "INVALID_COSTING_AGGREGATION_INPUT"],
  ] as const)("rejects null for %s", (property, value, code) => {
    expectCode(runtimeInput({ ...fixture(), [property]: value }), code);
  });

  it.each([
    [
      "condition=false",
      fixture({
        components: [
          component({ condition: { type: "boolean_literal", value: false } }),
        ],
        resources: [],
      }),
    ],
    ["zero components", fixture({ components: [], resources: [] })],
  ])("rejects an invalid effectiveCostAt with %s", (_name, valid) => {
    const malformed = { ...valid, effectiveCostAt: "not-a-timestamp" };
    expectCode(runtimeInput(malformed), "INVALID_COSTING_AGGREGATION_INPUT");
    try {
      aggregateCosting(runtimeInput(malformed));
    } catch (error) {
      expect(error).toBeInstanceOf(CostingDomainError);
      expect(error).not.toHaveProperty("name", "ZodError");
    }
  });

  it.each([
    ["root", (input: CostingAggregationInput) => ({ ...input, extra: true })],
    [
      "request",
      (input: CostingAggregationInput) => ({
        ...input,
        request: { ...input.request, extra: true },
      }),
    ],
    [
      "technical input",
      (input: CostingAggregationInput) => ({
        ...input,
        request: {
          ...input.request,
          technicalInputs: {
            flag: { kind: "boolean", value: true, extra: true },
          },
        },
      }),
    ],
    [
      "resource definition",
      (input: CostingAggregationInput) => ({
        ...input,
        resources: [
          {
            ...input.resources[0],
            definition: { ...input.resources[0].definition, extra: true },
          },
        ],
      }),
    ],
    [
      "cost rate",
      (input: CostingAggregationInput) => ({
        ...input,
        resources: [
          {
            ...input.resources[0],
            rates: [{ ...input.resources[0].rates[0], extra: true }],
          },
        ],
      }),
    ],
  ])("rejects an extra property in the %s", (_name, alter) => {
    expectCode(
      runtimeInput(alter(fixture())),
      "INVALID_COSTING_AGGREGATION_INPUT"
    );
  });

  it("maps malformed product definitions separately", () => {
    const input = fixture();
    expectCode(
      runtimeInput({
        ...input,
        productDefinition: { ...input.productDefinition, extra: true },
      }),
      "INVALID_PRODUCT_VERSION_DEFINITION"
    );
  });

  it("rejects a malformed scalar even when unused and unconstrained", () => {
    const input = fixture({
      inputs: [
        {
          id: ids.input,
          key: "factor",
          label: "Factor",
          required: false,
          sortOrder: 0,
          type: "DECIMAL",
          unit: null,
        },
      ],
    });
    expectCode(
      runtimeInput({
        ...input,
        request: {
          ...input.request,
          technicalInputs: {
            factor: { kind: "decimal", value: "not-decimal", unit: null },
          },
        },
      }),
      "INVALID_COSTING_AGGREGATION_INPUT"
    );
  });
});

describe("aggregateCosting calculations", () => {
  it("expands PER_UNIT exactly once", () => {
    const result = aggregateCosting(fixture());
    expect(result.components[0]).toMatchObject({
      baseCost: { amount: "10" },
      totalCostContribution: { amount: "30" },
      expandedCostQuantity: { amount: "6", unit: "un" },
    });
    expect(result.totalCost.amount).toBe("30");
  });

  it("aggregates mixed PER_UNIT and PER_QUOTE_ITEM contributions", () => {
    const fixedBundle = bundle({
      definition: { id: ids.secondResource },
      rates: [
        {
          id: ids.secondRate as never,
          type: "MATERIAL",
          materialId: ids.secondResource as never,
          amount: decimalString("7"),
          currency: "BRL",
          unit: "un",
          effectiveFrom: "2026-01-01T00:00:00Z",
          effectiveTo: null,
        },
      ],
    });
    const result = aggregateCosting(
      fixture({
        components: [
          component({ quantityExpression: decimalLiteral("1", "un") }),
          component({
            id: ids.secondComponent,
            materialId: ids.secondResource,
            quantityScope: "PER_QUOTE_ITEM",
            quantityExpression: decimalLiteral("1", "un"),
            sortOrder: 1,
          }),
        ],
        resources: [
          bundle({
            rates: [{ ...bundle().rates[0], amount: decimalString("10") }],
          }),
          fixedBundle,
        ],
      })
    );
    expect(result.unitVariableCost.amount).toBe("10");
    expect(result.quoteItemFixedCost.amount).toBe("7");
    expect(result.totalCost.amount).toBe("37");
    expect(
      result.components.map(item => item.totalCostContribution.amount)
    ).toEqual(["30", "7"]);
  });

  it.each([
    ["120", "min", "h", "60", "2", "120"],
    ["100", "cm", "m", "5", "1", "5"],
  ] as const)(
    "converts %s %s to the official %s cost unit",
    (quantity, quantityUnit, costUnit, rate, costQuantity, baseCost) => {
      const result = aggregateCosting(
        fixture({
          components: [
            component({
              quantityExpression: decimalLiteral(quantity, quantityUnit),
              quantityUnit,
            }),
          ],
          resources: [
            bundle({
              definition: { costUnit },
              rates: [
                {
                  ...bundle().rates[0],
                  amount: decimalString(rate),
                  unit: costUnit,
                },
              ],
            }),
          ],
        })
      );
      expect(result.components[0].costQuantity?.amount).toBe(costQuantity);
      expect(result.components[0].baseCost.amount).toBe(baseCost);
    }
  );

  it.each([
    ["m", "linear_m"],
    ["un", "sheet"],
    ["sheet", "m2"],
  ] as const)("rejects semantic conversion %s to %s", (from, to) => {
    const expression: Expression =
      from === "sheet"
        ? { type: "decimal_literal", value: decimalString("1"), unit: "sheet" }
        : decimalLiteral("1", from);
    expectCode(
      fixture({
        components: [
          component({ quantityExpression: expression, quantityUnit: from }),
        ],
        resources: [
          bundle({
            definition: { costUnit: to },
            rates: [{ ...bundle().rates[0], unit: to }],
          }),
        ],
      }),
      "INCOMPATIBLE_COST_UNIT"
    );
  });

  it("resolves the resource and rate for an included zero quantity", () => {
    const result = aggregateCosting(
      fixture({
        components: [
          component({ quantityExpression: decimalLiteral("0", "un") }),
        ],
      })
    );
    expect(result.components[0]).toMatchObject({
      included: true,
      rate: { id: ids.rate },
      baseCost: { amount: "0" },
      totalCostContribution: { amount: "0" },
    });
  });

  it("retains arbitrary Decimal precision", () => {
    const quantity = decimalString("0.12345678901234567890123456789");
    const rate = decimalString("12345678901234567890.12345678901234567890");
    const result = aggregateCosting(
      fixture({
        components: [
          component({
            quantityScope: "PER_QUOTE_ITEM",
            quantityExpression: {
              type: "decimal_literal",
              value: quantity,
              unit: "un",
            },
          }),
        ],
        resources: [
          bundle({ rates: [{ ...bundle().rates[0], amount: rate }] }),
        ],
      })
    );
    expect(result.totalCost.amount).toBe(multiplyDecimal(quantity, rate));
  });
});

describe("aggregateCosting rates and resources", () => {
  it("covers rate resolution failures", () => {
    expectCode(
      fixture({ resources: [bundle({ rates: [] })] }),
      "MISSING_COST_RATE"
    );
    const first = bundle().rates[0];
    expectCode(
      fixture({
        resources: [
          bundle({ rates: [first, { ...first, id: ids.secondRate as never }] }),
        ],
      }),
      "AMBIGUOUS_COST_RATE"
    );
    expectCode(
      fixture({ resources: [bundle({ definition: { costUnit: "h" } })] }),
      "COST_RATE_UNIT_MISMATCH"
    );
    expectCode(
      fixture({
        resources: [
          bundle({
            rates: [{ ...first, materialId: ids.secondResource as never }],
          }),
        ],
      }),
      "COST_RATE_RESOURCE_MISMATCH"
    );
  });

  it.each(["INACTIVE", "ARCHIVED"] as const)("rejects %s resources", status => {
    expectCode(
      fixture({ resources: [bundle({ definition: { status } })] }),
      "COST_RESOURCE_NOT_ACTIVE"
    );
  });

  it("accepts ACTIVE resources", () => {
    expect(aggregateCosting(fixture()).components[0].resource?.status).toBe(
      "ACTIVE"
    );
  });

  it("covers duplicate, wrong-type, and absent resource bundles", () => {
    expectCode(
      fixture({ resources: [bundle(), bundle()] }),
      "DUPLICATE_COST_RESOURCE"
    );
    const processBundle = costingResourceBundleSchema.parse({
      definition: {
        id: ids.resource,
        type: "PROCESS",
        code: "PROCESS",
        name: "Process",
        description: "",
        status: "ACTIVE",
        costUnit: "un",
      },
      rates: [],
    });
    expectCode(
      fixture({ resources: [processBundle] }),
      "COST_RESOURCE_REFERENCE_MISMATCH"
    );
    expectCode(fixture({ resources: [] }), "COST_RESOURCE_NOT_FOUND");
  });
});

describe("aggregateCosting technical inputs", () => {
  const decimalInput = (overrides: Partial<ProductInput> = {}): ProductInput =>
    ({
      id: ids.input,
      key: "factor",
      label: "Factor",
      required: true,
      sortOrder: 0,
      type: "DECIMAL",
      unit: null,
      ...overrides,
    }) as ProductInput;

  it("snapshots a provided scalar decimal", () => {
    const result = aggregateCosting(
      fixture({
        inputs: [decimalInput()],
        technicalInputs: {
          factor: { kind: "decimal", value: decimalString("1.25"), unit: null },
        },
      })
    );
    expect(result.resolvedInputs).toEqual([
      {
        key: "factor",
        source: "PROVIDED",
        value: { kind: "decimal", value: "1.25", unit: null },
      },
    ]);
  });

  it("reconstructs boolean and string snapshots", () => {
    const inputs: ProductInput[] = [
      {
        id: ids.input,
        key: "flag",
        label: "Flag",
        required: true,
        sortOrder: 0,
        type: "BOOLEAN",
      },
      {
        id: ids.secondComponent,
        key: "text",
        label: "Text",
        required: true,
        sortOrder: 1,
        type: "TEXT",
      },
    ];
    const result = aggregateCosting(
      fixture({
        inputs,
        technicalInputs: {
          flag: { kind: "boolean", value: true },
          text: { kind: "string", value: "safe" },
        },
      })
    );
    expect(result.resolvedInputs.map(item => item.value)).toEqual([
      { kind: "boolean", value: true },
      { kind: "string", value: "safe" },
    ]);
  });

  it.each([
    [
      decimalInput(),
      { kind: "boolean", value: true },
      "INVALID_TECHNICAL_INPUT",
    ],
    [
      {
        id: ids.input,
        key: "factor",
        label: "Factor",
        required: true,
        sortOrder: 0,
        type: "BOOLEAN",
      } as ProductInput,
      { kind: "string", value: "x" },
      "INVALID_TECHNICAL_INPUT",
    ],
    [
      {
        id: ids.input,
        key: "factor",
        label: "Factor",
        required: true,
        sortOrder: 0,
        type: "SELECT",
        options: [{ value: "a", label: "A" }],
      } as ProductInput,
      { kind: "string", value: "b" },
      "INVALID_TECHNICAL_INPUT",
    ],
    [
      {
        id: ids.input,
        key: "factor",
        label: "Factor",
        required: true,
        sortOrder: 0,
        type: "TEXT",
        maxLength: 1,
      } as ProductInput,
      { kind: "string", value: "too long" },
      "INVALID_TECHNICAL_INPUT",
    ],
    [
      decimalInput({ min: decimalString("2") }),
      { kind: "decimal", value: decimalString("1"), unit: null },
      "TECHNICAL_INPUT_OUT_OF_RANGE",
    ],
    [
      decimalInput({ max: decimalString("2") }),
      { kind: "decimal", value: decimalString("3"), unit: null },
      "TECHNICAL_INPUT_OUT_OF_RANGE",
    ],
  ] as const)(
    "rejects invalid input type/range %#",
    (input, supplied, code) => {
      expectCode(
        fixture({ inputs: [input], technicalInputs: { factor: supplied } }),
        code
      );
    }
  );

  it("covers unknown, required missing, and unreferenced optional inputs", () => {
    expectCode(
      fixture({ technicalInputs: { ghost: { kind: "boolean", value: true } } }),
      "UNKNOWN_TECHNICAL_INPUT"
    );
    expectCode(
      fixture({ inputs: [decimalInput()] }),
      "MISSING_TECHNICAL_INPUT"
    );
    expect(
      aggregateCosting(fixture({ inputs: [decimalInput({ required: false })] }))
        .resolvedInputs
    ).toEqual([]);
  });

  it.each(["variable", "condition", "quantity"] as const)(
    "rejects an optional missing input referenced by %s",
    location => {
      const input = decimalInput({ required: false, unit: "un" });
      const variables: ProductVariable[] =
        location === "variable"
          ? [
              {
                id: ids.variable,
                key: "copy",
                label: "Copy",
                sortOrder: 0,
                expression: ref("factor"),
              },
            ]
          : [];
      const changed =
        location === "condition"
          ? component({
              condition: {
                type: "binary",
                operator: "GT",
                left: ref("factor"),
                right: decimalLiteral("0", "un"),
              },
            })
          : location === "quantity"
            ? component({
                quantityExpression: ref("factor"),
                quantityUnit: "un",
              })
            : component();
      expectCode(
        fixture({ inputs: [input], variables, components: [changed] }),
        "MISSING_TECHNICAL_INPUT"
      );
    }
  );

  it("evaluates variables through the shared evaluator", () => {
    const width = decimalInput({ key: "width", unit: "m" });
    const variables: ProductVariable[] = [
      {
        id: ids.variable,
        key: "double_width",
        label: "Double width",
        sortOrder: 0,
        expression: {
          type: "binary",
          operator: "MULTIPLY",
          left: ref("width"),
          right: {
            type: "decimal_literal",
            value: decimalString("2"),
          },
        },
      },
    ];
    const result = aggregateCosting(
      fixture({
        inputs: [width],
        variables,
        technicalInputs: {
          width: { kind: "decimal", value: decimalString("2"), unit: "m" },
        },
        components: [
          component({
            quantityExpression: ref("double_width"),
            quantityUnit: "m",
          }),
        ],
        resources: [
          bundle({
            definition: { costUnit: "m" },
            rates: [{ ...bundle().rates[0], unit: "m" }],
          }),
        ],
      })
    );
    expect(result.components[0].costQuantity?.amount).toBe("4");
  });
});

describe("aggregateCosting product behavior", () => {
  it.each(["DRAFT", "VALIDATING", "RETIRED"] as const)(
    "rejects %s versions",
    status => {
      expectCode(fixture({ status }), "PRODUCT_VERSION_NOT_PUBLISHED");
    }
  );

  it("accepts PUBLISHED versions", () => {
    expect(
      aggregateCosting(fixture({ status: "PUBLISHED" })).productVersionId
    ).toBe(ids.version);
  });

  it("orders components by sortOrder and id", () => {
    const late = component({ id: ids.secondComponent, sortOrder: 1 });
    const tied = component({ id: ids.component, sortOrder: 1 });
    expect(
      aggregateCosting(fixture({ components: [late, tied] })).components.map(
        item => item.componentId
      )
    ).toEqual([ids.component, ids.secondComponent]);
  });

  it("does not expose commercialQuantity to expressions", () => {
    const definition = fixture().productDefinition;
    const malformed = {
      ...definition,
      components: [
        component({ quantityExpression: ref("commercialQuantity") }),
      ],
    };
    expectCode(
      runtimeInput({ ...fixture(), productDefinition: malformed }),
      "INVALID_PRODUCT_VERSION_DEFINITION"
    );
  });
});
