import {
  absDecimal,
  ceilDecimal,
  compareDecimal,
  decimalFrom,
  decimalString,
  floorDecimal,
  negateDecimal,
  roundDecimal,
} from "../decimal/index.js";
import { CalculationEngineError } from "../errors/index.js";
import {
  addDimensionalValues,
  compareDimensionalValues,
  divideDimensionalValues,
  multiplyDimensionalValues,
  resolveDecimalValue,
  scalarValue,
  subtractDimensionalValues,
  type DimensionalDecimalValue,
} from "../units/index.js";
import type { Expression } from "./ast.js";
import { validateExpression } from "./validate.js";
import {
  typeFromValue,
  type EvaluationContext,
  type ExpressionValue,
  type SymbolTable,
} from "./types.js";

const invalid = (message: string): never => {
  throw new CalculationEngineError("INVALID_OPERAND_TYPE", message);
};
const asDecimal = (value: ExpressionValue): DimensionalDecimalValue =>
  value.kind === "decimal" ? value : invalid("Expected DECIMAL");
const bool = (value: ExpressionValue): boolean =>
  value.kind === "boolean" ? value.value : invalid("Expected BOOLEAN");
const symbolsFor = (context: EvaluationContext): SymbolTable =>
  Object.fromEntries(
    Object.entries(context.values).map(([key, value]) => [
      key,
      { key, source: "CONTEXT" as const, type: typeFromValue(value) },
    ])
  );
const withValue = (
  value: DimensionalDecimalValue,
  amount: ReturnType<typeof decimalString>
): DimensionalDecimalValue => ({ ...value, value: amount });

function evaluateValid(
  expression: Expression,
  context: EvaluationContext
): ExpressionValue {
  switch (expression.type) {
    case "decimal_literal":
      return expression.unit
        ? resolveDecimalValue(expression.value, expression.unit)
        : scalarValue(expression.value);
    case "boolean_literal":
      return { kind: "boolean", value: expression.value };
    case "string_literal":
      return { kind: "string", value: expression.value };
    case "reference":
      return Object.hasOwn(context.values, expression.key)
        ? context.values[expression.key]
        : (() => {
            throw new CalculationEngineError(
              "UNKNOWN_REFERENCE",
              `Unknown reference: ${expression.key}`
            );
          })();
    case "unary": {
      const value = evaluateValid(expression.operand, context);
      return expression.operator === "NOT"
        ? { kind: "boolean", value: !bool(value) }
        : withValue(asDecimal(value), negateDecimal(asDecimal(value).value));
    }
    case "binary": {
      const left = evaluateValid(expression.left, context),
        right = evaluateValid(expression.right, context);
      if (expression.operator === "ADD")
        return addDimensionalValues(asDecimal(left), asDecimal(right));
      if (expression.operator === "SUBTRACT")
        return subtractDimensionalValues(asDecimal(left), asDecimal(right));
      if (expression.operator === "MULTIPLY")
        return multiplyDimensionalValues(asDecimal(left), asDecimal(right));
      if (expression.operator === "DIVIDE")
        return divideDimensionalValues(asDecimal(left), asDecimal(right));
      if (expression.operator === "AND")
        return { kind: "boolean", value: bool(left) && bool(right) };
      if (expression.operator === "OR")
        return { kind: "boolean", value: bool(left) || bool(right) };
      let comparison: number;
      if (left.kind === "decimal" && right.kind === "decimal")
        comparison = compareDimensionalValues(left, right);
      else if (left.kind === right.kind)
        comparison = left.value === right.value ? 0 : -1;
      else return invalid("Comparison operands must have the same type");
      const result =
        expression.operator === "EQ"
          ? comparison === 0
          : expression.operator === "NEQ"
            ? comparison !== 0
            : expression.operator === "GT"
              ? comparison > 0
              : expression.operator === "GTE"
                ? comparison >= 0
                : expression.operator === "LT"
                  ? comparison < 0
                  : comparison <= 0;
      return { kind: "boolean", value: result };
    }
    case "if":
      return evaluateValid(
        bool(evaluateValid(expression.condition, context))
          ? expression.then
          : expression.else,
        context
      );
    case "call": {
      const values = expression.arguments.map(argument =>
        asDecimal(evaluateValid(argument, context))
      );
      if (expression.function === "MIN" || expression.function === "MAX")
        return values.slice(1).reduce((best, value) => {
          const compared = compareDimensionalValues(value, best);
          return expression.function === "MIN"
            ? compared < 0
              ? value
              : best
            : compared > 0
              ? value
              : best;
        }, values[0]);
      const value = values[0];
      if (expression.function === "ABS")
        return withValue(value, absDecimal(value.value));
      if (expression.function === "CEIL")
        return withValue(value, ceilDecimal(value.value));
      if (expression.function === "FLOOR")
        return withValue(value, floorDecimal(value.value));
      const placesValue = values[1];
      const placesDecimal = decimalFrom(placesValue.value);
      if (
        !placesDecimal.isInteger() ||
        placesDecimal.isNegative() ||
        placesDecimal.greaterThan(500)
      )
        throw new CalculationEngineError(
          "INVALID_FUNCTION_ARGUMENT",
          "ROUND decimalPlaces must be an integer from 0 through 500"
        );
      return withValue(
        value,
        roundDecimal(value.value, placesDecimal.toNumber())
      );
    }
  }
}

export function evaluateExpression(
  expression: Expression,
  context: EvaluationContext
): ExpressionValue {
  validateExpression(expression, symbolsFor(context));
  return evaluateValid(expression, context);
}
