import type { CostRate } from "./rates.js";
import { assertValidCostRate } from "./rates.js";
import type { ResourceDefinition } from "./resources.js";
import { CostingDomainError } from "./errors.js";

function rateResourceId(rate: CostRate): string {
  switch (rate.type) {
    case "MATERIAL":
      return rate.materialId;
    case "PROCESS":
      return rate.processDefinitionId;
    case "OUTSOURCED_SERVICE":
      return rate.outsourcedServiceId;
    case "FIXED_COST":
      return rate.fixedCostDefinitionId;
  }
}

export function assertCostRateMatchesDefinition(
  definition: ResourceDefinition,
  rate: CostRate
): void {
  if (rate.type !== definition.type || rateResourceId(rate) !== definition.id) {
    throw new CostingDomainError(
      "COST_RATE_RESOURCE_MISMATCH",
      "Rate does not belong to the resource definition",
      { definitionId: definition.id, rateId: rate.id }
    );
  }
  if (rate.unit !== definition.costUnit) {
    throw new CostingDomainError(
      "COST_RATE_UNIT_MISMATCH",
      "Rate unit must equal the resource canonical cost unit",
      { costUnit: definition.costUnit, rateUnit: rate.unit }
    );
  }
}

export function validateCostRateSeries(
  definition: ResourceDefinition,
  rates: readonly CostRate[]
): void {
  for (const rate of rates) {
    assertValidCostRate(rate);
    assertCostRateMatchesDefinition(definition, rate);
  }
  const ordered = [...rates].sort(
    (a, b) => Date.parse(a.effectiveFrom) - Date.parse(b.effectiveFrom)
  );
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (
      previous.effectiveTo === null ||
      Date.parse(current.effectiveFrom) < Date.parse(previous.effectiveTo)
    ) {
      throw new CostingDomainError(
        "COST_RATE_OVERLAP",
        "Cost rate intervals overlap",
        { firstRateId: previous.id, secondRateId: current.id }
      );
    }
  }
}

export function assertResourceAvailableForNewCosting(
  definition: ResourceDefinition
): void {
  if (definition.status !== "ACTIVE") {
    throw new CostingDomainError(
      "COST_RESOURCE_NOT_ACTIVE",
      "Resource is not available for new costing",
      { resourceId: definition.id, status: definition.status }
    );
  }
}
