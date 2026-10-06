export const PRICING_ERROR_CODES = [
  "INVALID_PRICING_POLICY",
  "INVALID_PRICING_POLICY_VERSION",
  "INVALID_PRICING_RATE",
  "INVALID_PRICING_POLICY_TRANSITION",
  "PRICING_POLICY_VERSION_NOT_EDITABLE",
  "PRICING_POLICY_VERSION_NOT_PUBLISHED",
] as const;
export type PricingErrorCode = (typeof PRICING_ERROR_CODES)[number];
export class PricingDomainError extends Error {
  constructor(
    readonly code: PricingErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = "PricingDomainError";
  }
}
