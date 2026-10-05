import { describe, expect, it } from "vitest";
import { decimalString } from "../calculation-engine/decimal/index.js";
import {
  assertResourceAvailableForNewCosting,
  COSTABLE_UNIT_IDS,
  CostingDomainError,
  convertCostQuantity,
  costRateSchema,
  fixedCostDefinitionSchema,
  materialDefinitionSchema,
  outsourcedServiceDefinitionSchema,
  processDefinitionSchema,
  resolveEffectiveCostRate,
  resourceDefinitionSchema,
  validateCostRateSeries,
  type CostRate,
  type MaterialDefinition,
} from "./index.js";

const MATERIAL_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_ID = "10000000-0000-4000-8000-000000000002";
const RATE_A = "20000000-0000-4000-8000-000000000001";
const RATE_B = "20000000-0000-4000-8000-000000000002";

function material(overrides: Record<string, unknown> = {}): MaterialDefinition {
  return materialDefinitionSchema.parse({
    id: MATERIAL_ID,
    type: "MATERIAL",
    code: "PVC_10MM",
    name: "PVC",
    description: "Definition used by tests",
    status: "ACTIVE",
    costUnit: "m",
    ...overrides,
  });
}

function rate(overrides: Record<string, unknown> = {}): CostRate {
  return costRateSchema.parse({
    id: RATE_A,
    type: "MATERIAL",
    materialId: MATERIAL_ID,
    currency: "BRL",
    amount: "12.50",
    unit: "m",
    effectiveFrom: "2026-01-01T00:00:00Z",
    effectiveTo: null,
    ...overrides,
  });
}

function expectCode(action: () => unknown, code: string): void {
  try {
    action();
    expect.fail("Expected CostingDomainError");
  } catch (error) {
    expect(error).toBeInstanceOf(CostingDomainError);
    expect((error as CostingDomainError).code).toBe(code);
  }
}

describe("resource definitions", () => {
  it("parses every explicitly discriminated definition", () => {
    const common = {
      code: "RESOURCE_1",
      name: "Resource",
      description: "",
      status: "ACTIVE",
      costUnit: "un",
    };
    expect(
      materialDefinitionSchema.parse({
        ...common,
        id: MATERIAL_ID,
        type: "MATERIAL",
      }).type
    ).toBe("MATERIAL");
    expect(
      processDefinitionSchema.parse({
        ...common,
        id: MATERIAL_ID,
        type: "PROCESS",
      }).type
    ).toBe("PROCESS");
    expect(
      outsourcedServiceDefinitionSchema.parse({
        ...common,
        id: MATERIAL_ID,
        type: "OUTSOURCED_SERVICE",
      }).type
    ).toBe("OUTSOURCED_SERVICE");
    expect(
      fixedCostDefinitionSchema.parse({
        ...common,
        id: MATERIAL_ID,
        type: "FIXED_COST",
      }).type
    ).toBe("FIXED_COST");
  });

  it("rejects invalid codes, statuses, BRL and extra properties", () => {
    expect(() => material({ code: "lowercase" })).toThrow();
    expect(() => material({ status: "DELETED" })).toThrow();
    expect(() => material({ costUnit: "BRL" })).toThrow();
    expect(() => material({ supplierId: OTHER_ID })).toThrow();
    expect(COSTABLE_UNIT_IDS).not.toContain("BRL");
  });

  it("requires the correct public discriminant shape", () => {
    const value = { ...material(), type: "PROCESS", materialId: MATERIAL_ID };
    expect(resourceDefinitionSchema.safeParse(value).success).toBe(false);
  });
});

describe("rates and temporal resolution", () => {
  it("preserves high precision, permits zero and rejects negative cost", () => {
    const precise = "12345678901234567890.12345678901234567890";
    const parsed = rate({ amount: precise });
    expect(parsed.amount).toBe(precise);
    expect(
      resolveEffectiveCostRate(material(), [parsed], "2026-01-01T00:00:00Z")
        .amount
    ).toBe(precise);
    expect(rate({ amount: "0" }).amount).toBe("0");
    expect(() => rate({ amount: "-0.01" })).toThrow();
  });

  it("validates timestamps, strict positive intervals, and equivalent offsets", () => {
    expect(
      rate({ effectiveFrom: "2026-10-05T12:00:00Z" }).effectiveTo
    ).toBeNull();
    expect(() => rate({ effectiveFrom: "2026-01-01T00:00:00" })).toThrow();
    expect(() => rate({ effectiveTo: "2026-01-01T00:00:00Z" })).toThrow();
    expect(() => rate({ effectiveTo: "2025-12-31T23:59:59Z" })).toThrow();
    expect(() =>
      rate({
        effectiveFrom: "2026-10-05T12:00:00Z",
        effectiveTo: "2026-10-05T09:00:00-03:00",
      })
    ).toThrow();
    expect(
      rate({
        effectiveFrom: "2026-10-05T09:00:00-03:00",
        effectiveTo: "2026-10-05T12:00:01Z",
      })
    ).toBeTruthy();
  });

  it("accepts adjacency and gaps, but rejects overlap and two open ends", () => {
    const definition = material();
    const january = rate({ effectiveTo: "2026-02-01T00:00:00Z" });
    const february = rate({
      id: RATE_B,
      effectiveFrom: "2026-02-01T00:00:00Z",
    });
    expect(() =>
      validateCostRateSeries(definition, [january, february])
    ).not.toThrow();
    expectCode(
      () =>
        validateCostRateSeries(definition, [
          january,
          rate({ id: RATE_B, effectiveFrom: "2026-01-15T00:00:00Z" }),
        ]),
      "COST_RATE_OVERLAP"
    );
    expectCode(
      () =>
        validateCostRateSeries(definition, [
          rate(),
          rate({ id: RATE_B, effectiveFrom: "2026-02-01T00:00:00Z" }),
        ]),
      "COST_RATE_OVERLAP"
    );
    const march = rate({ id: RATE_B, effectiveFrom: "2026-03-01T00:00:00Z" });
    expect(() =>
      validateCostRateSeries(definition, [january, march])
    ).not.toThrow();
    expectCode(
      () =>
        resolveEffectiveCostRate(
          definition,
          [january, march],
          "2026-02-15T00:00:00Z"
        ),
      "MISSING_COST_RATE"
    );
  });

  it("uses inclusive lower and exclusive upper boundaries", () => {
    const first = rate({ effectiveTo: "2026-02-01T00:00:00Z" });
    const second = rate({ id: RATE_B, effectiveFrom: "2026-02-01T00:00:00Z" });
    expect(
      resolveEffectiveCostRate(
        material(),
        [first, second],
        "2026-01-01T00:00:00Z"
      ).id
    ).toBe(first.id);
    expect(
      resolveEffectiveCostRate(
        material(),
        [first, second],
        "2026-01-31T23:59:59Z"
      ).id
    ).toBe(first.id);
    expect(
      resolveEffectiveCostRate(
        material(),
        [first, second],
        "2026-02-01T00:00:00Z"
      ).id
    ).toBe(second.id);
  });

  it("fails closed on ambiguity without requiring series validation first", () => {
    expectCode(
      () =>
        resolveEffectiveCostRate(
          material(),
          [rate(), rate({ id: RATE_B })],
          "2026-04-01T00:00:00Z"
        ),
      "AMBIGUOUS_COST_RATE"
    );
  });

  it("rejects resource and canonical-unit mismatches", () => {
    expectCode(
      () =>
        validateCostRateSeries(material(), [rate({ materialId: OTHER_ID })]),
      "COST_RATE_RESOURCE_MISMATCH"
    );
    const process = processDefinitionSchema.parse({
      ...material(),
      type: "PROCESS",
      id: OTHER_ID,
    });
    expectCode(
      () => validateCostRateSeries(process, [rate()]),
      "COST_RATE_RESOURCE_MISMATCH"
    );
    expectCode(
      () =>
        validateCostRateSeries(material({ costUnit: "h" }), [
          rate({ unit: "min" }),
        ]),
      "COST_RATE_UNIT_MISMATCH"
    );
  });

  it("resolves archived history but gates new costing", () => {
    for (const status of ["INACTIVE", "ARCHIVED"] as const) {
      const definition = material({ status });
      expect(
        resolveEffectiveCostRate(definition, [rate()], "2026-04-01T00:00:00Z")
      ).toBeTruthy();
      expectCode(
        () => assertResourceAvailableForNewCosting(definition),
        "COST_RESOURCE_NOT_ACTIVE"
      );
    }
    expect(() =>
      assertResourceAvailableForNewCosting(material())
    ).not.toThrow();
  });
});

describe("cost quantity conversions", () => {
  it.each([
    ["100", "cm", "m", "1"],
    ["1", "m", "cm", "100"],
    ["1000", "g", "kg", "1"],
    ["1", "kg", "g", "1000"],
    ["120", "min", "h", "2"],
    ["2", "h", "min", "120"],
    ["0.000000000000000001", "m", "cm", "0.0000000000000001"],
  ] as const)("converts %s %s to %s exactly", (value, from, to, expected) => {
    expect(convertCostQuantity(decimalString(value), from, to)).toBe(expected);
  });

  it.each([
    ["m", "linear_m"],
    ["un", "sheet"],
    ["sheet", "m2"],
  ] as const)("rejects %s to %s semantic conversion", (from, to) => {
    expectCode(
      () => convertCostQuantity(decimalString("1"), from, to),
      "INCOMPATIBLE_COST_UNIT"
    );
  });

  it("rejects BRL as consumption", () => {
    expectCode(
      () => convertCostQuantity(decimalString("1"), "BRL", "un"),
      "INVALID_COST_QUANTITY_UNIT"
    );
  });
});
