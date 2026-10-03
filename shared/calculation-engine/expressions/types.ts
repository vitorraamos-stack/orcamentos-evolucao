import type { BooleanValue, StringValue } from "../contracts";
import type {
  DimensionalDecimalValue,
  DimensionalSemantic,
  UnitId,
} from "../units";
import type { Dimension } from "../units/dimensions";

export type ExpressionValue =
  | DimensionalDecimalValue
  | BooleanValue
  | StringValue;
export interface EvaluationContext {
  readonly values: Readonly<Record<string, ExpressionValue>>;
}
export type ExpressionValueType = "DECIMAL" | "BOOLEAN" | "STRING";
export type SymbolSource = "INPUT" | "VARIABLE" | "CONTEXT";
export type InferredType =
  | {
      readonly valueType: "DECIMAL";
      readonly unit: UnitId | null;
      readonly dimension: Dimension;
      readonly semantic: DimensionalSemantic;
    }
  | { readonly valueType: "BOOLEAN" | "STRING" };
export interface SymbolDefinition {
  readonly key: string;
  readonly source: SymbolSource;
  readonly type: InferredType;
}
export type SymbolTable = Readonly<Record<string, SymbolDefinition>>;

export function typeFromValue(value: ExpressionValue): InferredType {
  return value.kind === "decimal"
    ? {
        valueType: "DECIMAL",
        unit: value.unit,
        dimension: value.dimension,
        semantic: value.semantic,
      }
    : { valueType: value.kind === "boolean" ? "BOOLEAN" : "STRING" };
}
