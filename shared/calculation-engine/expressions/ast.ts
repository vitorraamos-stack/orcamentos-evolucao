import type { DecimalString } from "../decimal/index.js";
import type { UnitId } from "../units/index.js";

export const EXPRESSION_AST_VERSION = "1.0" as const;
export const UNARY_OPERATORS = ["NOT", "NEGATE"] as const;
export const BINARY_OPERATORS = [
  "ADD",
  "SUBTRACT",
  "MULTIPLY",
  "DIVIDE",
  "EQ",
  "NEQ",
  "GT",
  "GTE",
  "LT",
  "LTE",
  "AND",
  "OR",
] as const;
export const EXPRESSION_FUNCTIONS = [
  "MIN",
  "MAX",
  "ABS",
  "ROUND",
  "CEIL",
  "FLOOR",
] as const;

export type UnaryOperator = (typeof UNARY_OPERATORS)[number];
export type BinaryOperator = (typeof BINARY_OPERATORS)[number];
export type ExpressionFunction = (typeof EXPRESSION_FUNCTIONS)[number];

export type Expression =
  | {
      readonly type: "decimal_literal";
      readonly value: DecimalString;
      readonly unit?: UnitId;
    }
  | { readonly type: "boolean_literal"; readonly value: boolean }
  | { readonly type: "string_literal"; readonly value: string }
  | { readonly type: "reference"; readonly key: string }
  | {
      readonly type: "unary";
      readonly operator: UnaryOperator;
      readonly operand: Expression;
    }
  | {
      readonly type: "binary";
      readonly operator: BinaryOperator;
      readonly left: Expression;
      readonly right: Expression;
    }
  | {
      readonly type: "call";
      readonly function: ExpressionFunction;
      readonly arguments: readonly Expression[];
    }
  | {
      readonly type: "if";
      readonly condition: Expression;
      readonly then: Expression;
      readonly else: Expression;
    };
