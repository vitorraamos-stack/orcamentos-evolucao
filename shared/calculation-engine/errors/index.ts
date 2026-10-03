export const CALCULATION_ENGINE_ERROR_CODES = [
  "INVALID_DECIMAL",
  "DIVISION_BY_ZERO",
  "INCOMPATIBLE_DIMENSIONS",
  "INCOMPATIBLE_UNIT_SEMANTICS",
  "UNKNOWN_UNIT",
  "UNSUPPORTED_DIMENSION_RESULT",
  "UNKNOWN_REFERENCE",
  "INVALID_EXPRESSION",
  "INVALID_OPERAND_TYPE",
  "INVALID_FUNCTION_ARGUMENT",
  "INCOMPATIBLE_BRANCH_TYPES",
  "CYCLIC_DEPENDENCY",
  "DUPLICATE_VARIABLE_KEY",
  "EXPRESSION_LIMIT_EXCEEDED",
] as const;

export type CalculationEngineErrorCode =
  (typeof CALCULATION_ENGINE_ERROR_CODES)[number];

export class CalculationEngineError extends Error {
  readonly code: CalculationEngineErrorCode;
  readonly context?: Readonly<Record<string, unknown>>;

  constructor(
    code: CalculationEngineErrorCode,
    message: string,
    context?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = "CalculationEngineError";
    this.code = code;
    this.context = context;
  }
}
