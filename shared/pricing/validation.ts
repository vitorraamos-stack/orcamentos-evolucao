import {
  pricingCostBasisSchema,
  pricingMarkupSchema,
  pricingPolicySchema,
  pricingPolicyVersionDefinitionSchema,
  pricingPolicyVersionSchema,
  pricingRateSchema,
  type PricingCostBasis,
  type PricingMarkup,
  type PricingPolicy,
  type PricingPolicyVersion,
  type PricingPolicyVersionDefinition,
  type PricingPolicyVersionStatus,
  type PricingPublicationIssueCode,
  type PricingPublicationValidationResult,
  type PricingRate,
} from "./contracts.js";
import { PricingDomainError } from "./errors.js";
import {
  addRational,
  compareRational,
  rationalFromDecimal,
  rationalOne,
  rationalZero,
  subtractRational,
} from "./rational.js";

function hasProperty(input: unknown, key: string): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && key in input;
}

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

export function pricingMarkup(input: unknown): PricingMarkup {
  const result = pricingMarkupSchema.safeParse(input);
  if (!result.success)
    throw new PricingDomainError(
      "INVALID_PRICING_MARKUP",
      "Invalid pricing markup",
      { issues: result.error.issues }
    );
  return result.data;
}

export function validatePricingPolicyVersionDefinition(
  input: unknown
): PricingPolicyVersionDefinition {
  if (
    hasProperty(input, "schemaVersion") &&
    input.schemaVersion !== "1.0"
  )
    throw new PricingDomainError(
      "UNSUPPORTED_PRICING_SCHEMA_VERSION",
      "Unsupported pricing schema version"
    );
  const result = pricingPolicyVersionDefinitionSchema.safeParse(input);
  if (!result.success) {
    const duplicate = result.error.issues.some(
      issue => issue.message === "DUPLICATE_PRICING_CHARGE"
    );
    const chargeLimit = result.error.issues.some(
      issue => issue.code === "too_big" && issue.path[0] === "charges"
    );
    const invalidMarkup = result.error.issues.some(
      issue => issue.path[0] === "strategy" && issue.path[1] === "markup"
    );
    const code = duplicate
      ? "DUPLICATE_PRICING_CHARGE"
      : chargeLimit
        ? "PRICING_NUMERIC_LIMIT_EXCEEDED"
        : invalidMarkup
          ? "INVALID_PRICING_MARKUP"
          : "INVALID_PRICING_DEFINITION";
    throw new PricingDomainError(
      code,
      duplicate
        ? "Pricing charge IDs must be unique"
        : chargeLimit
          ? "Pricing charge collection exceeds the technical limit"
          : invalidMarkup
            ? "Invalid pricing markup"
            : "Invalid pricing definition",
      { issues: result.error.issues }
    );
  }
  return result.data;
}

export function validatePricingCostBasis(input: unknown): PricingCostBasis {
  if (
    hasProperty(input, "costingAggregationVersion") &&
    input.costingAggregationVersion !== "1.0"
  )
    throw new PricingDomainError(
      "UNSUPPORTED_COSTING_AGGREGATION_VERSION",
      "Unsupported costing aggregation version"
    );
  const result = pricingCostBasisSchema.safeParse(input);
  if (!result.success)
    throw new PricingDomainError(
      "INVALID_PRICING_COST_BASIS",
      "Invalid pricing cost basis",
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

function sellingRateSum(definition: PricingPolicyVersionDefinition) {
  return definition.charges
    .filter(charge => charge.percentageBase === "SELLING_PRICE")
    .reduce(
      (sum, charge) => addRational(sum, rationalFromDecimal(charge.rate)),
      rationalZero()
    );
}

function denominatorFor(definition: PricingPolicyVersionDefinition) {
  const sellingRates = sellingRateSum(definition);
  return definition.strategy.type === "GROSS_UP"
    ? subtractRational(
        subtractRational(rationalOne(), sellingRates),
        rationalFromDecimal(definition.strategy.targetMargin)
      )
    : subtractRational(rationalOne(), sellingRates);
}

export function validatePricingPublicationReadiness(
  policyInput: unknown,
  definitionInput: unknown
): PricingPublicationValidationResult {
  const issues: Array<{ code: PricingPublicationIssueCode; path?: string }> = [];
  const policyResult = pricingPolicySchema.safeParse(policyInput);
  let definition: PricingPolicyVersionDefinition | null = null;

  if (!policyResult.success)
    issues.push({ code: "INVALID_DEFINITION", path: "policy" });

  try {
    definition = validatePricingPolicyVersionDefinition(definitionInput);
  } catch (error) {
    if (error instanceof PricingDomainError) {
      if (error.code === "DUPLICATE_PRICING_CHARGE")
        issues.push({ code: "DUPLICATE_CHARGE", path: "charges" });
      else if (error.code === "PRICING_NUMERIC_LIMIT_EXCEEDED")
        issues.push({ code: "NUMERIC_LIMIT_EXCEEDED" });
      else issues.push({ code: "INVALID_DEFINITION", path: "definition" });
    } else throw error;
  }

  if (policyResult.success && definition) {
    if (
      definition.version.status !== "DRAFT" &&
      definition.version.status !== "VALIDATING"
    )
      issues.push({ code: "INVALID_VERSION_STATUS", path: "version.status" });
    if (definition.version.pricingPolicyId !== policyResult.data.id)
      issues.push({
        code: "POLICY_VERSION_MISMATCH",
        path: "version.pricingPolicyId",
      });
    try {
      if (compareRational(denominatorFor(definition), rationalZero()) <= 0)
        issues.push({ code: "INVALID_DENOMINATOR" });
    } catch (error) {
      if (
        error instanceof PricingDomainError &&
        error.code === "PRICING_NUMERIC_LIMIT_EXCEEDED"
      )
        issues.push({ code: "NUMERIC_LIMIT_EXCEEDED" });
      else throw error;
    }
  }

  return { ready: issues.length === 0, issues };
}
