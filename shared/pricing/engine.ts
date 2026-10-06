import {
  pricingEngineResultSchema,
  type PricingEngineResult,
  type PricingPolicyVersionDefinition,
} from "./contracts.js";
import { PricingDomainError } from "./errors.js";
import {
  addRational,
  compareRational,
  divideRational,
  multiplyRational,
  rationalFromDecimal,
  rationalOne,
  rationalZero,
  serializeRational,
  subtractRational,
  type ExactRational,
} from "./rational.js";
import {
  assertPricingPolicyVersionPublished,
  validatePricingCostBasis,
  validatePricingPolicy,
  validatePricingPolicyVersionDefinition,
} from "./validation.js";
import { PRICING_ENGINE_VERSION } from "./version.js";

function inputRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new PricingDomainError(
      "INVALID_PRICING_DEFINITION",
      "Invalid pricing engine input"
    );
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(",") !== "costBasis,definition,policy")
    throw new PricingDomainError(
      "INVALID_PRICING_DEFINITION",
      "Invalid pricing engine input"
    );
  return record;
}

function sumChargeRates(
  definition: PricingPolicyVersionDefinition,
  percentageBase: "TOTAL_COST" | "SELLING_PRICE"
): ExactRational {
  return definition.charges
    .filter(charge => charge.percentageBase === percentageBase)
    .reduce(
      (sum, charge) => addRational(sum, rationalFromDecimal(charge.rate)),
      rationalZero()
    );
}

function assertPositiveDenominator(value: ExactRational): void {
  if (compareRational(value, rationalZero()) <= 0)
    throw new PricingDomainError(
      "INVALID_PRICING_DENOMINATOR",
      "Pricing denominator must be greater than zero"
    );
}

function money(value: ExactRational) {
  return { currency: "BRL" as const, amount: serializeRational(value) };
}

export function calculatePricing(input: unknown): PricingEngineResult {
  const record = inputRecord(input);
  const policy = validatePricingPolicy(record.policy);
  const definition = validatePricingPolicyVersionDefinition(record.definition);
  const costBasis = validatePricingCostBasis(record.costBasis);

  if (policy.status !== "ACTIVE")
    throw new PricingDomainError(
      "PRICING_POLICY_NOT_ACTIVE",
      "Pricing policy must be active"
    );
  assertPricingPolicyVersionPublished(definition.version);
  if (definition.version.pricingPolicyId !== policy.id)
    throw new PricingDomainError(
      "PRICING_POLICY_VERSION_MISMATCH",
      "Pricing policy version does not belong to the selected policy"
    );

  const totalCost = rationalFromDecimal(costBasis.totalCost.amount);
  const costRateSum = sumChargeRates(definition, "TOTAL_COST");
  const sellingRateSum = sumChargeRates(definition, "SELLING_PRICE");
  const costBasedCharges = multiplyRational(totalCost, costRateSum);
  const costPlusCharges = addRational(totalCost, costBasedCharges);

  let sellingPrice: ExactRational;
  let profitAmount: ExactRational;
  if (definition.strategy.type === "GROSS_UP") {
    const denominator = subtractRational(
      subtractRational(rationalOne(), sellingRateSum),
      rationalFromDecimal(definition.strategy.targetMargin)
    );
    assertPositiveDenominator(denominator);
    sellingPrice = divideRational(costPlusCharges, denominator);
    profitAmount = multiplyRational(
      sellingPrice,
      rationalFromDecimal(definition.strategy.targetMargin)
    );
  } else {
    const denominator = subtractRational(rationalOne(), sellingRateSum);
    assertPositiveDenominator(denominator);
    const markupBase =
      definition.strategy.markupBase === "TOTAL_COST"
        ? totalCost
        : costPlusCharges;
    profitAmount = multiplyRational(
      markupBase,
      rationalFromDecimal(definition.strategy.markup)
    );
    sellingPrice = divideRational(
      addRational(costPlusCharges, profitAmount),
      denominator
    );
  }

  const sellingPriceBasedCharges = multiplyRational(
    sellingPrice,
    sellingRateSum
  );
  const realizedMargin =
    compareRational(sellingPrice, rationalZero()) === 0
      ? null
      : serializeRational(divideRational(profitAmount, sellingPrice));

  const result: PricingEngineResult = {
    engineVersion: PRICING_ENGINE_VERSION,
    schemaVersion: definition.schemaVersion,
    policyId: policy.id,
    policyVersionId: definition.version.id,
    policyVersionNumber: definition.version.versionNumber,
    policyVersionRevision: definition.version.revision,
    productId: costBasis.productId,
    productVersionId: costBasis.productVersionId,
    productVersionNumber: costBasis.productVersionNumber,
    productVersionRevision: costBasis.productVersionRevision,
    costingAggregationVersion: costBasis.costingAggregationVersion,
    effectiveCostAt: costBasis.effectiveCostAt,
    commercialQuantity: costBasis.commercialQuantity,
    strategy: definition.strategy,
    technicalPrecision: "DECIMAL_50_HALF_EVEN_V1",
    unroundedTotalSellingPrice: money(sellingPrice),
    breakdown: {
      totalCost: money(totalCost),
      costBasedCharges: money(costBasedCharges),
      sellingPriceBasedCharges: money(sellingPriceBasedCharges),
      profitAmount: money(profitAmount),
      realizedMargin,
    },
  };
  const validated = pricingEngineResultSchema.safeParse(result);
  if (!validated.success)
    throw new PricingDomainError(
      "INVALID_PRICING_ENGINE_RESULT",
      "Pricing engine produced an invalid result",
      { issues: validated.error.issues }
    );
  return validated.data;
}
