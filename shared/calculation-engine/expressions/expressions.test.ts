import { describe, expect, it } from "vitest";
import {
  CalculationEngineError,
  DIMENSIONS,
  EXPRESSION_AST_VERSION,
  MAX_AST_DEPTH,
  collectReferences,
  decimalString,
  divideDimensionalValues,
  evaluateExpression,
  evaluateVariables,
  expressionSchema,
  resolveDecimalValue,
  scalarValue,
  topologicallySortVariables,
  validateExpression,
  type Expression,
  type ExpressionValue,
} from "..";

const decimal = (
  value: string,
  unit?: Parameters<typeof resolveDecimalValue>[1]
) =>
  unit
    ? resolveDecimalValue(decimalString(value), unit)
    : scalarValue(decimalString(value));
const ref = (key: string): Expression => ({ type: "reference", key });
const literal = (
  value: string,
  unit?: "m" | "m2" | "kg" | "BRL"
): Expression => ({
  type: "decimal_literal",
  value: decimalString(value),
  ...(unit ? { unit } : {}),
});
const binary = (
  operator: "ADD" | "MULTIPLY" | "DIVIDE" | "GT" | "EQ",
  left: Expression,
  right: Expression
): Expression => ({ type: "binary", operator, left, right });
const errorCode = (action: () => unknown, code: string) => {
  try {
    action();
    throw new Error("Expected CalculationEngineError");
  } catch (error) {
    expect(error).toBeInstanceOf(CalculationEngineError);
    expect((error as CalculationEngineError).code).toBe(code);
  }
};

describe("safe expression schema", () => {
  it("is independently versioned and JSON-safe", () => {
    expect(EXPRESSION_AST_VERSION).toBe("1.0");
    const ast = binary("MULTIPLY", ref("width"), literal("1.10"));
    expect(JSON.parse(JSON.stringify(ast))).toEqual(ast);
  });
  it.each([
    { type: "javascript", code: "process.exit()" },
    { type: "reference", key: "width", javascript: "process.exit()" },
    { type: "reference", key: "constructor" },
    { type: "call", function: "Math.random", arguments: [] },
  ])("rejects non-canonical or unsafe payloads", payload =>
    expect(expressionSchema.safeParse(payload).success).toBe(false)
  );
  it("enforces depth before evaluation", () => {
    let ast: Expression = literal("1");
    for (let i = 0; i < MAX_AST_DEPTH; i++)
      ast = { type: "unary", operator: "NEGATE", operand: ast };
    errorCode(() => validateExpression(ast), "EXPRESSION_LIMIT_EXCEEDED");
  });
});

describe("expression evaluation", () => {
  it("evaluates arithmetic, comparisons, booleans and strings without coercion", () => {
    const context = {
      values: {
        width: decimal("3", "m"),
        height: decimal("0.8", "m"),
        installation: { kind: "boolean", value: true },
        finish: { kind: "string", value: "painted" },
      },
    } as const;
    expect(
      evaluateExpression(
        binary("MULTIPLY", ref("width"), ref("height")),
        context
      )
    ).toMatchObject({ value: "2.4", unit: "m2" });
    expect(
      evaluateExpression(
        binary("GT", ref("width"), literal("80", "m")),
        context
      )
    ).toEqual({ kind: "boolean", value: false });
    expect(
      evaluateExpression(
        binary(
          "GT",
          { type: "decimal_literal", value: decimalString("0.90"), unit: "m" },
          { type: "decimal_literal", value: decimalString("0.80"), unit: "m" }
        ),
        context
      )
    ).toEqual({ kind: "boolean", value: true });
    expect(
      evaluateExpression(
        binary("EQ", ref("finish"), {
          type: "string_literal",
          value: "painted",
        }),
        context
      )
    ).toEqual({ kind: "boolean", value: true });
    expect(
      evaluateExpression(
        { type: "unary", operator: "NOT", operand: ref("installation") },
        context
      )
    ).toEqual({ kind: "boolean", value: false });
    expect(
      evaluateExpression(
        {
          type: "binary",
          operator: "AND",
          left: ref("installation"),
          right: { type: "boolean_literal", value: true },
        },
        context
      )
    ).toEqual({ kind: "boolean", value: true });
    expect(
      evaluateExpression(
        { type: "unary", operator: "NEGATE", operand: literal("10") },
        context
      )
    ).toMatchObject({ value: "-10" });
  });
  it.each([true, false])(
    "evaluates both IF outcomes while validating both branches",
    installation => {
      const result = evaluateExpression(
        {
          type: "if",
          condition: ref("installation"),
          then: literal("100", "BRL"),
          else: literal("0", "BRL"),
        },
        { values: { installation: { kind: "boolean", value: installation } } }
      );
      expect(result).toMatchObject({
        value: installation ? "100" : "0",
        unit: "BRL",
      });
    }
  );
  it("supports the allowlisted mathematical functions", () => {
    const evaluate = (
      fn: "MIN" | "MAX" | "ABS" | "ROUND" | "CEIL" | "FLOOR",
      args: Expression[]
    ) =>
      evaluateExpression(
        { type: "call", function: fn, arguments: args },
        { values: {} }
      );
    expect(
      evaluate("MAX", [
        literal("1", "m"),
        { type: "decimal_literal", value: decimalString("50"), unit: "cm" },
      ])
    ).toMatchObject({ value: "1", unit: "m" });
    expect(
      evaluate("MIN", [
        literal("1", "m"),
        { type: "decimal_literal", value: decimalString("50"), unit: "cm" },
      ])
    ).toMatchObject({ value: "50", unit: "cm" });
    expect(evaluate("ABS", [literal("-2", "m")])).toMatchObject({
      value: "2",
      unit: "m",
    });
    expect(
      evaluate("ROUND", [literal("2.345", "m"), literal("2")])
    ).toMatchObject({ value: "2.34", unit: "m" });
    expect(evaluate("CEIL", [literal("2.1", "m")])).toMatchObject({
      value: "3",
      unit: "m",
    });
    expect(evaluate("FLOOR", [literal("2.9", "m")])).toMatchObject({
      value: "2",
      unit: "m",
    });
  });
  it("reports typed validation and arithmetic errors", () => {
    errorCode(
      () =>
        evaluateExpression(
          binary("ADD", literal("1", "kg"), literal("1", "m")),
          { values: {} }
        ),
      "INVALID_OPERAND_TYPE"
    );
    errorCode(
      () =>
        evaluateExpression(
          binary(
            "ADD",
            { type: "boolean_literal", value: true },
            literal("10")
          ),
          { values: {} }
        ),
      "INVALID_OPERAND_TYPE"
    );
    errorCode(
      () => evaluateExpression(ref("unknown_ref"), { values: {} }),
      "UNKNOWN_REFERENCE"
    );
    errorCode(
      () =>
        evaluateExpression(
          {
            type: "if",
            condition: { type: "boolean_literal", value: true },
            then: literal("1", "m"),
            else: literal("1", "kg"),
          },
          { values: {} }
        ),
      "INCOMPATIBLE_BRANCH_TYPES"
    );
    errorCode(
      () =>
        evaluateExpression(binary("DIVIDE", literal("10"), literal("0")), {
          values: {},
        }),
      "DIVISION_BY_ZERO"
    );
  });
});

describe("dependency graph", () => {
  const variables = [
    {
      key: "material_cost",
      expression: binary(
        "MULTIPLY",
        ref("area_with_waste"),
        ref("price_per_area")
      ),
    },
    {
      key: "area_with_waste",
      expression: binary("MULTIPLY", ref("area"), literal("1.10")),
    },
    {
      key: "area",
      expression: binary("MULTIPLY", ref("width"), ref("height")),
    },
  ];
  it("collects unique sorted references and deterministically sorts variables", () => {
    expect(
      collectReferences(
        binary("ADD", ref("z"), binary("ADD", ref("a"), ref("z")))
      )
    ).toEqual(["a", "z"]);
    expect(
      topologicallySortVariables(
        ["width", "height", "price_per_area"],
        variables
      ).map(item => item.key)
    ).toEqual(["area", "area_with_waste", "material_cost"]);
  });
  it("evaluates area, waste and a derived currency-per-area input", () => {
    const pricePerArea = divideDimensionalValues(
      decimal("45", "BRL"),
      decimal("1", "m2")
    );
    expect(pricePerArea).toMatchObject({
      unit: null,
      semantic: "derived",
      dimension: { currency: 1, length: -2 },
    });
    const result = evaluateVariables({
      inputs: {
        width: decimal("3", "m"),
        height: decimal("0.8", "m"),
        price_per_area: pricePerArea,
      },
      variables,
    });
    expect(result.area).toMatchObject({ value: "2.4", unit: "m2" });
    expect(result.area_with_waste).toMatchObject({ value: "2.64", unit: "m2" });
    expect(result.material_cost).toMatchObject({
      value: "118.8",
      unit: "BRL",
      dimension: DIMENSIONS.currency,
    });
  });
  it("rejects unknowns, duplicate keys, cycles and self references", () => {
    errorCode(
      () =>
        topologicallySortVariables(
          [],
          [{ key: "a", expression: ref("missing") }]
        ),
      "UNKNOWN_REFERENCE"
    );
    errorCode(
      () =>
        topologicallySortVariables(
          [],
          [
            { key: "a", expression: literal("1") },
            { key: "a", expression: literal("2") },
          ]
        ),
      "DUPLICATE_VARIABLE_KEY"
    );
    errorCode(
      () =>
        topologicallySortVariables(
          [],
          [
            { key: "a", expression: ref("b") },
            { key: "b", expression: ref("a") },
          ]
        ),
      "CYCLIC_DEPENDENCY"
    );
    errorCode(
      () =>
        topologicallySortVariables(
          [],
          [{ key: "area", expression: ref("area") }]
        ),
      "CYCLIC_DEPENDENCY"
    );
  });
});
