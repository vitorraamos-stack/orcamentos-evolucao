export const COSTING_ERROR_CODES = [
  "NEGATIVE_COST_RATE",
  "INVALID_COST_INTERVAL",
  "COST_RATE_RESOURCE_MISMATCH",
  "COST_RATE_UNIT_MISMATCH",
  "COST_RATE_OVERLAP",
  "MISSING_COST_RATE",
  "AMBIGUOUS_COST_RATE",
  "COST_RESOURCE_NOT_ACTIVE",
  "INVALID_COST_QUANTITY_UNIT",
  "INCOMPATIBLE_COST_UNIT",
] as const;

export type CostingErrorCode = (typeof COSTING_ERROR_CODES)[number];

export class CostingDomainError extends Error {
  constructor(
    public readonly code: CostingErrorCode,
    message: string,
    public readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = "CostingDomainError";
  }
}
