import { describe, expect, it, vi } from "vitest";
import { decimalString } from "../../../shared/calculation-engine/index.js";
import {
  officialCostingRequestSchema,
  type CostingResourceBundle,
} from "../../../shared/costing/index.js";
import { productVersionDefinitionSchema } from "../../../shared/product-engineering/index.js";
import { OfficialCostingCalculationService } from "./calculationService.js";

const ids = {
  product: "10000000-0000-4000-8000-000000000001",
  version: "10000000-0000-4000-8000-000000000002",
  user: "10000000-0000-4000-8000-000000000003",
  component: "10000000-0000-4000-8000-000000000004",
  resource: "10000000-0000-4000-8000-000000000005",
  rateA: "10000000-0000-4000-8000-000000000006",
  rateB: "10000000-0000-4000-8000-000000000007",
};

const component = (overrides: Record<string, unknown> = {}) => ({
  id: ids.component,
  type: "MATERIAL",
  materialId: ids.resource,
  label: "Material",
  sortOrder: 0,
  quantityScope: "PER_UNIT",
  quantityExpression: { type: "decimal_literal", value: "2", unit: "un" },
  quantityUnit: "un",
  ...overrides,
});

const definition = (
  status = "PUBLISHED",
  components = [component()],
  inputs: readonly unknown[] = [],
  variables: readonly unknown[] = []
) =>
  productVersionDefinitionSchema.parse({
    schemaVersion: "1.0",
    version: {
      id: ids.version,
      productId: ids.product,
      versionNumber: 1,
      revision: 1,
      status,
      createdAt: "2026-01-01T00:00:00Z",
      createdBy: ids.user,
      publishedAt: ["PUBLISHED", "RETIRED"].includes(status)
        ? "2026-01-02T00:00:00Z"
        : null,
      publishedBy: ["PUBLISHED", "RETIRED"].includes(status) ? ids.user : null,
    },
    inputs,
    variables,
    components,
  });

const resource = (rates: readonly unknown[] = []): CostingResourceBundle =>
  ({
    definition: {
      id: ids.resource,
      type: "MATERIAL",
      code: "MAT",
      name: "Material",
      description: "",
      status: "ACTIVE",
      costUnit: "un",
    },
    rates,
  }) as CostingResourceBundle;

const rates = [
  {
    id: ids.rateA,
    type: "MATERIAL",
    materialId: ids.resource,
    amount: "5",
    currency: "BRL",
    unit: "un",
    effectiveFrom: "2026-01-01T00:00:00Z",
    effectiveTo: "2026-10-05T13:00:00Z",
  },
  {
    id: ids.rateB,
    type: "MATERIAL",
    materialId: ids.resource,
    amount: "7",
    currency: "BRL",
    unit: "un",
    effectiveFrom: "2026-10-05T13:00:00Z",
    effectiveTo: null,
  },
];

const request = officialCostingRequestSchema.parse({
  productVersionId: ids.version,
  request: { commercialQuantity: decimalString("3"), technicalInputs: {} },
});

const setup = (
  product = definition(),
  bundle = resource(rates),
  clock = () => "2026-10-05T12:00:00Z" as const
) => {
  const engineering = { loadDefinition: vi.fn(async () => product) };
  const costing = {
    loadResource: vi.fn(async () => ({
      resource: bundle.definition,
      rates: bundle.rates,
    })),
    loadProductParameters: vi.fn(async () => []),
  };
  return {
    service: new OfficialCostingCalculationService(engineering, costing, clock),
    engineering,
    costing,
  };
};

describe("OfficialCostingCalculationService", () => {
  it("produces the official aggregate and captures the server clock once", async () => {
    let calls = 0;
    const { service } = setup(definition(), resource(rates), () => {
      calls += 1;
      return "2026-10-05T12:00:00Z";
    });
    const result = await service.calculate(request);
    expect(calls).toBe(1);
    expect(result).toMatchObject({
      productVersionId: ids.version,
      effectiveCostAt: "2026-10-05T12:00:00Z",
      commercialQuantity: "3",
      unitVariableCost: { amount: "10" },
      quoteItemFixedCost: { amount: "0" },
      totalCost: { amount: "30" },
    });
    expect(result.components[0]).toMatchObject({
      included: true,
      resource: { id: ids.resource },
      rate: { id: ids.rateA },
    });
  });

  it("uses a different rate only when the injected server time changes", async () => {
    const early = await setup().service.calculate(request);
    const late = await setup(
      definition(),
      resource(rates),
      () => "2026-10-05T14:00:00Z"
    ).service.calculate(request);
    expect(early.components[0].rate?.id).toBe(ids.rateA);
    expect(late.components[0].rate?.id).toBe(ids.rateB);
  });

  it("deduplicates references while retaining both component contributions", async () => {
    const second = component({
      id: "10000000-0000-4000-8000-000000000008",
      sortOrder: 1,
    });
    const { service, costing } = setup(
      definition("PUBLISHED", [component(), second])
    );
    const result = await service.calculate(request);
    expect(costing.loadResource).toHaveBeenCalledOnce();
    expect(result.components).toHaveLength(2);
    expect(result.totalCost.amount).toBe("60");
  });

  it("lets aggregation skip a false condition without resolving a rate", async () => {
    const falseComponent = component({
      condition: { type: "boolean_literal", value: false },
    });
    const result = await setup(
      definition("PUBLISHED", [falseComponent]),
      resource([])
    ).service.calculate(request);
    expect(result.components[0]).toMatchObject({ included: false });
    expect(result.components[0].rate).toBeUndefined();
    expect(result.totalCost.amount).toBe("0");
  });

  it("preserves rate, resource, and publication domain failures", async () => {
    await expect(
      setup(definition(), resource([])).service.calculate(request)
    ).rejects.toMatchObject({ code: "MISSING_COST_RATE" });
    const inactive = resource(rates);
    (inactive.definition as any).status = "INACTIVE";
    await expect(
      setup(definition(), inactive).service.calculate(request)
    ).rejects.toMatchObject({ code: "COST_RESOURCE_NOT_ACTIVE" });
    for (const status of ["DRAFT", "VALIDATING", "RETIRED"])
      await expect(
        setup(definition(status)).service.calculate(request)
      ).rejects.toMatchObject({ code: "PRODUCT_VERSION_NOT_PUBLISHED" });
  });

  it("injects server-managed product parameters and rejects client overrides", async () => {
    const managedComponent = component({
      quantityExpression: { type: "reference", key: "paint_coats" },
    });
    const product = definition(
      "PUBLISHED",
      [managedComponent],
      [
        {
          id: "10000000-0000-4000-8000-000000000040",
          key: "paint_coats",
          label: "Demãos padrão",
          type: "DECIMAL",
          required: true,
          sortOrder: 0,
          unit: "un",
        },
      ]
    );
    const costing = {
      loadResource: vi.fn(async () => ({
        resource: resource(rates).definition,
        rates,
      })),
      loadProductParameters: vi.fn(async () => [
        {
          productId: ids.product,
          key: "paint_coats",
          label: "Demãos padrão",
          description: null,
          value: "2",
          unit: "un",
          minValue: "1",
          maxValue: "5",
          revision: 1,
          updatedAt: "2026-10-05T10:00:00Z",
          updatedBy: ids.user,
        },
      ]),
    };
    const service = new OfficialCostingCalculationService(
      { loadDefinition: vi.fn(async () => product) },
      costing,
      () => "2026-10-05T12:00:00Z"
    );

    const result = await service.calculate(
      officialCostingRequestSchema.parse({
        productVersionId: ids.version,
        request: { commercialQuantity: "1", technicalInputs: {} },
      })
    );
    expect(result.totalCost.amount).toBe("10");
    expect(result.resolvedInputs).toContainEqual({
      key: "paint_coats",
      value: { kind: "decimal", value: "2", unit: "un" },
      source: "SERVER_PARAMETER",
    });

    await expect(
      service.calculate(
        officialCostingRequestSchema.parse({
          productVersionId: ids.version,
          request: {
            commercialQuantity: "1",
            technicalInputs: {
              paint_coats: { kind: "decimal", value: "4", unit: "un" },
            },
          },
        })
      )
    ).rejects.toMatchObject({ code: "SERVER_MANAGED_TECHNICAL_INPUT" });
  });

  it("does not load any resources for components excluded by a false condition", async () => {
    const specifications = [
      [
        "PROCESS",
        "processDefinitionId",
        "10000000-0000-4000-8000-000000000020",
      ],
      ["MATERIAL", "materialId", ids.resource],
      [
        "OUTSOURCED_SERVICE",
        "outsourcedServiceId",
        "10000000-0000-4000-8000-000000000021",
      ],
      [
        "FIXED_COST",
        "fixedCostDefinitionId",
        "10000000-0000-4000-8000-000000000022",
      ],
    ] as const;
    const components = specifications.map(([type, field, id], index) => {
      const value: Record<string, unknown> = component({
        id: `10000000-0000-4000-8000-${String(30 + index).padStart(12, "0")}`,
        type,
        [field]: id,
        sortOrder: index,
        condition: { type: "boolean_literal", value: false },
      });
      if (type !== "MATERIAL") delete value.materialId;
      return value;
    });
    const product = definition("PUBLISHED", components);
    const costing = {
      loadResource: vi.fn(async (type: string, id: string) => ({
        resource: {
          id,
          type,
          code: "RESOURCE",
          name: "Resource",
          description: "",
          status: "ACTIVE",
          costUnit: "un",
        },
        rates: [],
      })),
      loadProductParameters: vi.fn(async () => []),
    };
    const service = new OfficialCostingCalculationService(
      { loadDefinition: vi.fn(async () => product) },
      costing as never,
      () => "2026-10-05T12:00:00Z"
    );
    await service.calculate(request);
    expect(costing.loadResource).not.toHaveBeenCalled();
  });
  it.each(["2", "3", "5", "10", "15", "20", "30"])(
    "loads only the matching CNC cut tariff for PVC %s mm", async thickness => {
      const choices = ["2", "3", "5", "10", "15", "20", "30"];
      const cutResourceId = (n: number) =>
        `10000000-0000-4000-8000-${String(100 + n).padStart(12, "0")}`;
      const parts = choices.map((candidate, i) => ({
        id: `10000000-0000-4000-8000-${String(200 + i).padStart(12, "0")}`,
        type: "OUTSOURCED_SERVICE",
        outsourcedServiceId: cutResourceId(i),
        label: `Corte CNC PVC ${candidate} mm`,
        sortOrder: i,
        quantityScope: "PER_UNIT",
        quantityExpression: { type: "decimal_literal", value: "1", unit: "un" },
        quantityUnit: "un",
        condition: {
          type: "binary", operator: "EQ",
          left: { type: "reference", key: "thickness" },
          right: { type: "string_literal", value: candidate },
        },
      }));
      const paintResourceId = cutResourceId(7);
      parts.push({
        id: `10000000-0000-4000-8000-${String(207).padStart(12, "0")}`,
        type: "MATERIAL",
        materialId: paintResourceId,
        label: "Tinta automotiva",
        sortOrder: 7,
        quantityScope: "PER_UNIT",
        quantityExpression: { type: "decimal_literal", value: "1", unit: "un" },
        quantityUnit: "un",
        condition: {
          type: "binary", operator: "GT",
          left: { type: "reference", key: "color_count" },
          right: { type: "decimal_literal", value: "0" },
        },
      } as never);

      const inputs = [
        {
          id: "10000000-0000-4000-8000-000000000041",
          key: "thickness", label: "Espessura",
          type: "SELECT", required: true, sortOrder: 0,
          options: choices.map(n => ({ value: n, label: n + " mm" })),
        },
        {
          id: "10000000-0000-4000-8000-000000000042",
          key: "number_of_colors", label: "Número de cores",
          type: "DECIMAL", unit: null, required: true, sortOrder: 1,
          defaultValue: "0",
        },
      ];
      const def = definition("PUBLISHED", parts as never, inputs, [{
        id: "10000000-0000-4000-8000-000000000043",
        key: "color_count", label: "Cores arredondadas", sortOrder: 0,
        expectedValueType: "DECIMAL", expectedUnit: null,
        expression: {
          type: "call", function: "CEIL",
          arguments: [{ type: "reference", key: "number_of_colors" }],
        },
      }]);
      const costing = {
        loadProductParameters: vi.fn(async () => []),
        loadResource: vi.fn(async (type: string, id: string) => ({
          resource: {
            id, type, code: "PVC", name: "Serviço de corte CNC",
            description: "", status: "ACTIVE", costUnit: "un",
          },
          rates: [{
            id: ids.rateA, type,
            ...(type === "MATERIAL" ? { materialId: id } : { outsourcedServiceId: id }),
            amount: "20", currency: "BRL", unit: "un",
            effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null,
          }],
        })),
      };
      const service = new OfficialCostingCalculationService(
        { loadDefinition: vi.fn(async () => def) },
        costing as never, () => "2026-10-05T12:00:00Z"
      );
      const result = await service.calculate(officialCostingRequestSchema.parse({
        productVersionId: ids.version,
        request: {
          commercialQuantity: "2",
          technicalInputs: { thickness: { kind: "string", value: thickness } },
        },
      }));
      expect(costing.loadResource.mock.calls).toEqual([
        ["OUTSOURCED_SERVICE", cutResourceId(choices.indexOf(thickness))],
      ]);
      expect(result.totalCost.amount).toBe("40");
      expect(result.components).toHaveLength(8);
      expect(result.components.filter(c => c.included)).toHaveLength(1);
      expect(result.components.filter(c => !c.included)).toHaveLength(7);
      expect(result.components.filter(c => !c.included)
        .every(c => !c.rate && !c.resource)).toBe(true);
      // The real published PVC model derives "color_count" via CEIL.
      // When colors become positive, the paint resource must be loaded too.
      costing.loadResource.mockClear();
      const painted = await service.calculate(officialCostingRequestSchema.parse({
        productVersionId: ids.version,
        request: {
          commercialQuantity: "2",
          technicalInputs: {
            thickness: { kind: "string", value: thickness },
            number_of_colors: { kind: "decimal", value: "1", unit: null },
          },
        },
      }));
      expect(costing.loadResource.mock.calls).toEqual([
        ["MATERIAL", paintResourceId],
        ["OUTSOURCED_SERVICE", cutResourceId(choices.indexOf(thickness))],
      ]);
      expect(painted.components.filter(c => c.included)).toHaveLength(2);
      expect(painted.totalCost.amount).toBe("80");
    }
  );

  it("requires a vigente cost rate for a TRUE condition even when quantity is zero", async () => {
    const zeroPart = component({
      quantityExpression: { type: "decimal_literal", value: "0", unit: "un" },
      condition: { type: "boolean_literal", value: true },
    });
    const { service, costing } = setup(definition("PUBLISHED", [zeroPart]), resource([]));
    await expect(service.calculate(request)).rejects.toMatchObject({
      code: "MISSING_COST_RATE",
    });
    expect(costing.loadResource).toHaveBeenCalledOnce();
  });

  it("rejects unknown technical inputs before fetching any cost resource", async () => {
    const { service, costing } = setup();
    await expect(service.calculate(officialCostingRequestSchema.parse({
      productVersionId: ids.version,
      request: {
        commercialQuantity: "1",
        technicalInputs: { unknown: { kind: "decimal", value: "1", unit: null } },
      },
    }))).rejects.toMatchObject({ code: "UNKNOWN_TECHNICAL_INPUT" });
    expect(costing.loadResource).not.toHaveBeenCalled();
  });

});

describe("officialCostingRequestSchema", () => {
  it("rejects client-owned costing fields, including effectiveCostAt", () => {
    for (const field of [
      "effectiveCostAt",
      "resources",
      "rates",
      "productDefinition",
      "totalCost",
    ])
      expect(
        officialCostingRequestSchema.safeParse({ ...request, [field]: [] })
          .success
      ).toBe(false);
    expect(request).not.toHaveProperty("effectiveCostAt");
  });
});
