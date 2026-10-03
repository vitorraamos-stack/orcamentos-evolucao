import { CalculationEngineError } from "../errors";
import { UNIT_CATALOG } from "../units";
import {
  addDimensionExponents,
  dimensionsEqual,
  isScalarDimension,
  subtractDimensionExponents,
} from "../units/dimensions";
import type { Expression } from "./ast";
import { assertExpressionLimits, MAX_AST_DEPTH, MAX_AST_NODES } from "./limits";
import { expressionSchema } from "./schema";
import type { InferredType, SymbolTable } from "./types";

const fail = (
  code:
    | "INVALID_EXPRESSION"
    | "INVALID_OPERAND_TYPE"
    | "INVALID_FUNCTION_ARGUMENT"
    | "INCOMPATIBLE_BRANCH_TYPES"
    | "UNKNOWN_REFERENCE",
  message: string,
  context?: Record<string, unknown>
): never => {
  throw new CalculationEngineError(code, message, context);
};
const decimal = (
  type: InferredType
): Extract<InferredType, { valueType: "DECIMAL" }> =>
  type.valueType === "DECIMAL"
    ? type
    : fail("INVALID_OPERAND_TYPE", "Expected a decimal operand", {
        actual: type.valueType,
      });
const sameDecimal = (left: InferredType, right: InferredType): void => {
  const a = decimal(left),
    b = decimal(right);
  if (!dimensionsEqual(a.dimension, b.dimension) || a.semantic !== b.semantic)
    fail(
      "INVALID_OPERAND_TYPE",
      "Decimal operands are dimensionally or semantically incompatible"
    );
};
const derived = (
  dimension: ReturnType<typeof addDimensionExponents>,
  left: Extract<InferredType, { valueType: "DECIMAL" }>,
  right: Extract<InferredType, { valueType: "DECIMAL" }>
): InferredType => {
  if (isScalarDimension(dimension))
    return { valueType: "DECIMAL", dimension, unit: null, semantic: "scalar" };
  const preserved = isScalarDimension(left.dimension)
    ? right
    : isScalarDimension(right.dimension)
      ? left
      : null;
  if (preserved && dimensionsEqual(preserved.dimension, dimension))
    return { ...preserved };
  const unit = dimensionsEqual(dimension, UNIT_CATALOG.m.dimension)
    ? "m"
    : dimensionsEqual(dimension, UNIT_CATALOG.m2.dimension)
      ? "m2"
      : dimensionsEqual(dimension, UNIT_CATALOG.kg.dimension)
        ? "kg"
        : dimensionsEqual(dimension, UNIT_CATALOG.h.dimension)
          ? "h"
          : dimensionsEqual(dimension, UNIT_CATALOG.BRL.dimension)
            ? "BRL"
            : null;
  return {
    valueType: "DECIMAL",
    dimension,
    unit,
    semantic: unit ? UNIT_CATALOG[unit].semantic : "derived",
  };
};

export function inferExpressionType(
  expression: Expression,
  symbols: SymbolTable = {}
): InferredType {
  switch (expression.type) {
    case "decimal_literal":
      return expression.unit
        ? {
            valueType: "DECIMAL",
            unit: expression.unit,
            dimension: UNIT_CATALOG[expression.unit].dimension,
            semantic: UNIT_CATALOG[expression.unit].semantic,
          }
        : {
            valueType: "DECIMAL",
            unit: null,
            dimension: { length: 0, mass: 0, time: 0, currency: 0, count: 0 },
            semantic: "scalar",
          };
    case "boolean_literal":
      return { valueType: "BOOLEAN" };
    case "string_literal":
      return { valueType: "STRING" };
    case "reference": {
      const symbol = Object.hasOwn(symbols, expression.key)
        ? symbols[expression.key]
        : undefined;
      return (
        symbol?.type ??
        fail("UNKNOWN_REFERENCE", `Unknown reference: ${expression.key}`, {
          key: expression.key,
        })
      );
    }
    case "unary": {
      const operand = inferExpressionType(expression.operand, symbols);
      if (expression.operator === "NOT")
        return operand.valueType === "BOOLEAN"
          ? operand
          : fail("INVALID_OPERAND_TYPE", "NOT requires BOOLEAN");
      return decimal(operand);
    }
    case "binary": {
      const left = inferExpressionType(expression.left, symbols),
        right = inferExpressionType(expression.right, symbols);
      if (["ADD", "SUBTRACT"].includes(expression.operator)) {
        sameDecimal(left, right);
        return decimal(left);
      }
      if (
        expression.operator === "MULTIPLY" ||
        expression.operator === "DIVIDE"
      ) {
        const a = decimal(left),
          b = decimal(right);
        return derived(
          expression.operator === "MULTIPLY"
            ? addDimensionExponents(a.dimension, b.dimension)
            : subtractDimensionExponents(a.dimension, b.dimension),
          a,
          b
        );
      }
      if (["AND", "OR"].includes(expression.operator))
        return left.valueType === "BOOLEAN" && right.valueType === "BOOLEAN"
          ? { valueType: "BOOLEAN" }
          : fail(
              "INVALID_OPERAND_TYPE",
              `${expression.operator} requires BOOLEAN operands`
            );
      if (["GT", "GTE", "LT", "LTE"].includes(expression.operator))
        sameDecimal(left, right);
      else if (left.valueType !== right.valueType)
        fail(
          "INVALID_OPERAND_TYPE",
          "Equality operands must have the same type"
        );
      else if (left.valueType === "DECIMAL") sameDecimal(left, right);
      return { valueType: "BOOLEAN" };
    }
    case "call": {
      const args = expression.arguments.map(argument =>
        inferExpressionType(argument, symbols)
      );
      const count = args.length;
      if (
        (expression.function === "MIN" || expression.function === "MAX") &&
        count >= 1
      ) {
        args.slice(1).forEach(arg => sameDecimal(args[0], arg));
        return decimal(args[0]);
      }
      if (["ABS", "CEIL", "FLOOR"].includes(expression.function) && count === 1)
        return decimal(args[0]);
      if (expression.function === "ROUND" && count === 2) {
        decimal(args[0]);
        const places = decimal(args[1]);
        if (!isScalarDimension(places.dimension))
          fail(
            "INVALID_FUNCTION_ARGUMENT",
            "ROUND decimalPlaces must be scalar"
          );
        return decimal(args[0]);
      }
      return fail(
        "INVALID_FUNCTION_ARGUMENT",
        `Invalid arguments for ${expression.function}`,
        { count }
      );
    }
    case "if": {
      const condition = inferExpressionType(expression.condition, symbols);
      if (condition.valueType !== "BOOLEAN")
        fail("INVALID_OPERAND_TYPE", "IF condition must be BOOLEAN");
      const thenType = inferExpressionType(expression.then, symbols),
        elseType = inferExpressionType(expression.else, symbols);
      if (thenType.valueType !== elseType.valueType)
        fail("INCOMPATIBLE_BRANCH_TYPES", "IF branches have different types");
      if (thenType.valueType === "DECIMAL") {
        try {
          sameDecimal(thenType, elseType);
        } catch {
          fail(
            "INCOMPATIBLE_BRANCH_TYPES",
            "IF decimal branches are incompatible"
          );
        }
      }
      return thenType;
    }
  }
}

export function validateExpression(
  input: unknown,
  symbols: SymbolTable = {}
): InferredType {
  // Bound hostile JSON before Zod enters its recursive lazy schema.
  let rawNodes = 0;
  const rawStack: Array<{ value: unknown; depth: number }> = [
    { value: input, depth: 1 },
  ];
  while (rawStack.length) {
    const { value, depth } = rawStack.pop()!;
    if (typeof value !== "object" || value === null) continue;
    if (!Array.isArray(value)) rawNodes += 1;
    if (depth > MAX_AST_DEPTH || rawNodes > MAX_AST_NODES)
      throw new CalculationEngineError(
        "EXPRESSION_LIMIT_EXCEEDED",
        "Expression exceeds AST limits",
        { depth, nodes: rawNodes }
      );
    for (const child of Object.values(value))
      if (typeof child === "object" && child !== null)
        rawStack.push({
          value: child,
          depth: Array.isArray(value) ? depth : depth + 1,
        });
  }
  const parsed = expressionSchema.safeParse(input);
  if (!parsed.success)
    throw new CalculationEngineError(
      "INVALID_EXPRESSION",
      "Expression does not match the canonical AST schema",
      { issues: parsed.error.issues }
    );
  assertExpressionLimits(parsed.data);
  return inferExpressionType(parsed.data, symbols);
}
