import {
  pricingPolicySchema,
  pricingPolicyVersionSchema,
  pricingRateSchema,
  type PricingPolicy,
  type PricingPolicyVersion,
  type PricingPolicyVersionStatus,
  type PricingRate,
} from "./contracts.js";
import { PricingDomainError } from "./errors.js";

export function validatePricingPolicy(input: unknown): PricingPolicy {
  const result = pricingPolicySchema.safeParse(input);
  if (!result.success)
    throw new PricingDomainError(
      "INVALID_PRICING_POLICY",
      "Invalid pricing policy",
      { issues: result.error.issues }
    );
  return result.data;
}
export function validatePricingPolicyVersion(
  input: unknown
): PricingPolicyVersion {
  const result = pricingPolicyVersionSchema.safeParse(input);
  if (!result.success)
    throw new PricingDomainError(
      "INVALID_PRICING_POLICY_VERSION",
      "Invalid pricing policy version",
      { issues: result.error.issues }
    );
  return result.data;
}
export function pricingRate(input: unknown): PricingRate {
  const result = pricingRateSchema.safeParse(input);
  if (!result.success)
    throw new PricingDomainError(
      "INVALID_PRICING_RATE",
      "Invalid pricing rate",
      { issues: result.error.issues }
    );
  return result.data;
}
const transitions: Readonly<
  Record<PricingPolicyVersionStatus, readonly PricingPolicyVersionStatus[]>
> = {
  DRAFT: ["VALIDATING"],
  VALIDATING: ["DRAFT", "PUBLISHED"],
  PUBLISHED: ["RETIRED"],
  RETIRED: [],
};
export function assertPricingPolicyVersionTransition(
  from: PricingPolicyVersionStatus,
  to: PricingPolicyVersionStatus
): void {
  if (!transitions[from]?.includes(to))
    throw new PricingDomainError(
      "INVALID_PRICING_POLICY_TRANSITION",
      `Pricing policy version cannot transition from ${from} to ${to}`,
      { from, to }
    );
}
export function assertPricingPolicyVersionEditable(
  version: Pick<PricingPolicyVersion, "status">
): void {
  if (version.status !== "DRAFT")
    throw new PricingDomainError(
      "PRICING_POLICY_VERSION_NOT_EDITABLE",
      `${version.status} pricing policy versions cannot be edited`
    );
}
export function assertPricingPolicyVersionPublished(
  version: Pick<PricingPolicyVersion, "status">
): void {
  if (version.status !== "PUBLISHED")
    throw new PricingDomainError(
      "PRICING_POLICY_VERSION_NOT_PUBLISHED",
      "Pricing policy version must be PUBLISHED"
    );
}
