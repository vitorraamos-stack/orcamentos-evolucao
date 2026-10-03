export const CALCULATION_ENGINE_ERROR_CODES = [
  "INVALID_DECIMAL",
  "DIVISION_BY_ZERO",
  "INCOMPATIBLE_DIMENSIONS",
  "INCOMPATIBLE_UNIT_SEMANTICS",
  "UNKNOWN_UNIT",
  "UNSUPPORTED_DIMENSION_RESULT",
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
