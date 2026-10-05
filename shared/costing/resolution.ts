import type { CostRate, CostTimestamp } from "./rates.js";
import { assertValidCostRate, costTimestampSchema } from "./rates.js";
import type { ResourceDefinition } from "./resources.js";
import { CostingDomainError } from "./errors.js";
import {
  assertCostRateMatchesDefinition,
  validateCostRateSeries,
} from "./validation.js";

/**
 * Resolves [effectiveFrom, effectiveTo). `effectiveCostAt` is internal domain
 * context; future HTTP APIs must derive it from server authority, not a browser.
 */
export function resolveEffectiveCostRate(
  definition: ResourceDefinition,
  rates: readonly CostRate[],
  effectiveCostAt: CostTimestamp
): CostRate {
  const instant = Date.parse(costTimestampSchema.parse(effectiveCostAt));
  for (const rate of rates) {
    assertValidCostRate(rate);
    assertCostRateMatchesDefinition(definition, rate);
  }
  const matches = rates.filter(
    rate =>
      Date.parse(rate.effectiveFrom) <= instant &&
      (rate.effectiveTo === null || instant < Date.parse(rate.effectiveTo))
  );
  if (matches.length === 0)
    throw new CostingDomainError(
      "MISSING_COST_RATE",
      "No effective cost rate exists",
      { resourceId: definition.id, effectiveCostAt }
    );
  if (matches.length > 1)
    throw new CostingDomainError(
      "AMBIGUOUS_COST_RATE",
      "Multiple cost rates are effective",
      {
        resourceId: definition.id,
        effectiveCostAt,
        rateIds: matches.map(rate => rate.id),
      }
    );
  return matches[0];
}

// Explicit export documents that full-series validation is separate from fail-closed lookup.
export { validateCostRateSeries };
