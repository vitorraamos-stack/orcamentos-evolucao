import { describe, expect, it } from "vitest";
import {
  calculationRequestSchema,
  configurableKeySchema,
  decimalStringSchema,
  getUniversalConversion,
  isReservedEngineKey,
  quantityScopeSchema,
  QUANTITY_SCOPES,
  UNIT_CATALOG,
  UNIT_IDS,
} from ".";

describe("decimal contracts", () => {
  it.each(["0", "10", "0.10", "123.456", "-10"])(
    "accepts %s without numeric coercion",
    value => {
      const parsed = decimalStringSchema.parse(value);
      expect(parsed).toBe(value);
      expect(typeof parsed).toBe("string");
    }
  );

  it.each(["NaN", "Infinity", "1e999", "abc", "10,50"])("rejects %s", value => {
    expect(decimalStringSchema.safeParse(value).success).toBe(false);
  });
});

describe("unit catalog and universal conversions", () => {
  it("uses linear_m, while ml is only a presentation symbol", () => {
    expect(UNIT_IDS).toContain("linear_m");
    expect(UNIT_IDS).not.toContain("ml");
    expect(UNIT_CATALOG.linear_m.symbol).toBe("ml");
  });

  it.each([
    ["mm", "m", "1000"],
    ["cm", "m", "100"],
    ["g", "kg", "1000"],
    ["min", "h", "60"],
  ] as const)("formalizes %s → %s exactly", (from, to, denominator) => {
    expect(getUniversalConversion(from, to)).toMatchObject({
      numerator: "1",
      denominator,
    });
  });

  it.each([
    ["sheet", "m2"],
    ["un", "sheet"],
    ["m", "linear_m"],
  ] as const)("does not implicitly convert %s → %s", (from, to) => {
    expect(getUniversalConversion(from, to)).toBeUndefined();
  });
});

describe("configurable namespaces", () => {
  it.each([
    "commercial_quantity",
    "engine",
    "system",
    "engine_test",
    "system_value",
  ])("reserves %s", key => {
    expect(isReservedEngineKey(key)).toBe(true);
    expect(configurableKeySchema.safeParse(key).success).toBe(false);
  });

  it.each(["width", "height", "area_with_waste", "holes_count"])(
    "accepts %s",
    key => {
      expect(configurableKeySchema.safeParse(key).success).toBe(true);
    }
  );

  it.each(["Width", "área", "width-height"])(
    "rejects invalid syntax %s",
    key => {
      expect(configurableKeySchema.safeParse(key).success).toBe(false);
    }
  );
});

describe("quantity contracts", () => {
  it("allows only the two MVP scopes", () => {
    expect(QUANTITY_SCOPES).toEqual(["PER_UNIT", "PER_QUOTE_ITEM"]);
    expect(quantityScopeSchema.safeParse("PER_UNIT").success).toBe(true);
    expect(quantityScopeSchema.safeParse("PER_QUOTE_ITEM").success).toBe(true);
    expect(quantityScopeSchema.safeParse("BATCH_DEPENDENT").success).toBe(
      false
    );
  });

  it("keeps commercialQuantity outside technical inputs", () => {
    const fixture = calculationRequestSchema.parse({
      commercialQuantity: "10",
      technicalInputs: {
        width: { kind: "decimal", value: "500", unit: "mm" },
      },
    });

    expect(fixture.commercialQuantity).toBe("10");
    expect(fixture.technicalInputs).not.toHaveProperty("commercial_quantity");
    expect(
      calculationRequestSchema.safeParse({
        commercialQuantity: "10",
        technicalInputs: {
          commercial_quantity: { kind: "decimal", value: "2", unit: "un" },
        },
      }).success
    ).toBe(false);
  });
});
