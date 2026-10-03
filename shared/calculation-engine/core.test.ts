import { describe, expect, it } from "vitest";
import {
  absDecimal,
  addDecimal,
  addDimensionalValues,
  CalculationEngineError,
  calculationRequestSchema,
  compareDecimal,
  compareDimensionalValues,
  convertUnit,
  decimalFrom,
  decimalString,
  dimensionsEqual,
  divideDecimal,
  divideDimensionalValues,
  maxDecimal,
  minDecimal,
  multiplyDecimal,
  multiplyDimensionalValues,
  resolveDecimalValue,
  scalarValue,
  serializeDecimal,
  subtractDecimal,
  subtractDimensionalValues,
  DIMENSIONS,
} from ".";

const d = decimalString;
const value = (
  amount: string,
  unit: Parameters<typeof resolveDecimalValue>[1]
) => resolveDecimalValue(d(amount), unit);

function expectEngineError(action: () => unknown, code: string) {
  try {
    action();
    throw new Error("Expected calculation engine error");
  } catch (error) {
    expect(error).toBeInstanceOf(CalculationEngineError);
    expect((error as CalculationEngineError).code).toBe(code);
  }
}

describe("decimal arithmetic", () => {
  it.each([
    ["1", "2", "3", addDecimal],
    ["0.1", "0.2", "0.3", addDecimal],
    ["10", "0.1", "9.9", subtractDecimal],
    ["1.5", "2", "3", multiplyDecimal],
    ["10", "4", "2.5", divideDecimal],
  ] as const)(
    "calculates %s and %s exactly",
    (left, right, expected, operation) => {
      expect(operation(d(left), d(right))).toBe(expected);
    }
  );

  it("provides comparison, absolute value and extrema", () => {
    expect(compareDecimal(d("1"), d("2"))).toBe(-1);
    expect(absDecimal(d("-2.5"))).toBe("2.5");
    expect(minDecimal(d("1"), d("2"))).toBe("1");
    expect(maxDecimal(d("1"), d("2"))).toBe("2");
  });

  it("throws a typed error on division by zero", () => {
    expectEngineError(() => divideDecimal(d("10"), d("0")), "DIVISION_BY_ZERO");
  });

  it("enforces the decimal magnitude limit", () => {
    expect(serializeDecimal(decimalFrom(d(`1${"0".repeat(1_000)}`)))).toBe(
      `1${"0".repeat(1_000)}`
    );
    expectEngineError(
      () => decimalFrom(d(`1${"0".repeat(1_001)}`)),
      "INVALID_DECIMAL"
    );
  });

  it.each([
    ["0.0000001", "0.0000001"],
    ["10000000000", "10000000000"],
    ["-0", "0"],
  ])("serializes %s without exponent notation", (input, expected) => {
    const result = serializeDecimal(decimalFrom(d(input)));
    expect(result).toBe(expected);
    expect(result).not.toMatch(/[eE]/);
  });
});

describe("universal unit conversion", () => {
  it.each([
    ["100", "cm", "m", "1"],
    ["1000", "mm", "m", "1"],
    ["1", "m", "cm", "100"],
    ["1", "m", "mm", "1000"],
    ["1000", "g", "kg", "1"],
    ["1", "kg", "g", "1000"],
    ["60", "min", "h", "1"],
    ["1", "h", "min", "60"],
  ] as const)("converts %s %s to %s %s", (amount, from, to, expected) => {
    expect(convertUnit(d(amount), from, to)).toBe(expected);
  });

  it.each([
    ["m", "linear_m", "INCOMPATIBLE_UNIT_SEMANTICS"],
    ["linear_m", "m", "INCOMPATIBLE_UNIT_SEMANTICS"],
    ["un", "sheet", "INCOMPATIBLE_UNIT_SEMANTICS"],
    ["sheet", "un", "INCOMPATIBLE_UNIT_SEMANTICS"],
    ["sheet", "m2", "INCOMPATIBLE_DIMENSIONS"],
    ["kg", "m", "INCOMPATIBLE_DIMENSIONS"],
  ] as const)("forbids implicit %s to %s", (from, to, code) => {
    expectEngineError(() => convertUnit(d("1"), from, to), code);
  });
});

describe("dimensional values", () => {
  it.each([
    ["1", "m", "50", "cm", "1.5", "m"],
    ["1", "kg", "500", "g", "1.5", "kg"],
    ["1", "h", "30", "min", "1.5", "h"],
    ["10", "BRL", "5", "BRL", "15", "BRL"],
  ] as const)("adds compatible values", (a, au, b, bu, expected, unit) => {
    expect(addDimensionalValues(value(a, au), value(b, bu))).toMatchObject({
      value: expected,
      unit,
    });
  });

  it("subtracts after canonical normalization", () => {
    expect(
      subtractDimensionalValues(value("2", "m"), value("50", "cm"))
    ).toMatchObject({
      value: "1.5",
      unit: "m",
    });
  });

  it.each([
    ["kg", "m", "INCOMPATIBLE_DIMENSIONS"],
    ["m2", "m", "INCOMPATIBLE_DIMENSIONS"],
    ["m", "linear_m", "INCOMPATIBLE_UNIT_SEMANTICS"],
    ["un", "sheet", "INCOMPATIBLE_UNIT_SEMANTICS"],
  ] as const)("rejects addition of %s and %s", (left, right, code) => {
    expectEngineError(
      () => addDimensionalValues(value("1", left), value("1", right)),
      code
    );
  });

  it("multiplies lengths into canonical area", () => {
    const result = multiplyDimensionalValues(value("2", "m"), value("3", "m"));
    expect(result).toMatchObject({
      value: "6",
      unit: "m2",
      semantic: "physical",
    });
    expect(dimensionsEqual(result.dimension, DIMENSIONS.area)).toBe(true);
  });

  it("computes the Letreiro PVC width and height area", () => {
    expect(
      multiplyDimensionalValues(value("3", "m"), value("0.8", "m"))
    ).toMatchObject({
      value: "2.4",
      unit: "m2",
    });
  });

  it.each([
    [value("2", "m"), scalarValue(d("3")), "6", "m"],
    [value("20", "BRL"), scalarValue(d("3")), "60", "BRL"],
    [value("2", "kg"), scalarValue(d("3")), "6", "kg"],
  ] as const)(
    "preserves a unit when multiplying by a scalar",
    (left, right, amount, unit) => {
      expect(multiplyDimensionalValues(left, right)).toMatchObject({
        value: amount,
        unit,
      });
    }
  );

  it.each([
    [value("6", "m2"), value("3", "m"), "2", "m"],
    [value("6", "m"), value("3", "m"), "2", null],
    [value("100", "BRL"), scalarValue(d("4")), "25", "BRL"],
  ] as const)("divides dimensional values", (left, right, amount, unit) => {
    expect(divideDimensionalValues(left, right)).toMatchObject({
      value: amount,
      unit,
    });
  });

  it("compares only dimensionally and semantically compatible values", () => {
    expect(compareDimensionalValues(value("1", "m"), value("50", "cm"))).toBe(
      1
    );
    expect(
      compareDimensionalValues(value("10", "BRL"), value("10", "BRL"))
    ).toBe(0);
    expectEngineError(
      () => compareDimensionalValues(value("1", "kg"), value("1", "m")),
      "INCOMPATIBLE_DIMENSIONS"
    );
    expectEngineError(
      () => compareDimensionalValues(value("1", "m"), value("1", "linear_m")),
      "INCOMPATIBLE_UNIT_SEMANTICS"
    );
  });
});

describe("external contract boundary", () => {
  it("rejects a forged dimension instead of trusting it", () => {
    expect(
      calculationRequestSchema.safeParse({
        commercialQuantity: "1",
        technicalInputs: {
          width: {
            kind: "decimal",
            value: "1",
            unit: "m",
            dimension: "currency",
          },
        },
      }).success
    ).toBe(false);
    expect(resolveDecimalValue(d("1"), "m").dimension).toEqual(
      DIMENSIONS.length
    );
  });
});
