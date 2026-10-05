import {
  QUANTITY_EXPANSION_OWNER,
  type Money,
} from "../calculation-engine/contracts/index.js";
import {
  addDecimal,
  compareDecimal,
  decimalString,
  multiplyDecimal,
  type DecimalString,
} from "../calculation-engine/decimal/index.js";
import {
  collectReferences,
  evaluateExpression,
  evaluateVariables,
  type Expression,
  type ExpressionValue,
} from "../calculation-engine/expressions/index.js";
import { convertUnit } from "../calculation-engine/units/index.js";
import {
  validateProductVersionForPublication,
  type ProductComponent,
} from "../product-engineering/index.js";
import {
  COSTING_AGGREGATION_VERSION,
  costingAggregationInputSchema,
  type ComponentCostResult,
  type CostingAggregateResult,
  type CostingAggregationInput,
  type CostingResourceBundle,
} from "./aggregationContracts.js";
import { CostingDomainError } from "./errors.js";
import { resolveTechnicalInputs } from "./inputResolution.js";
import { resolveEffectiveCostRate } from "./resolution.js";
import type { ResourceDefinition } from "./resources.js";
import { costableUnitIdSchema, convertCostQuantity } from "./units.js";
import { assertResourceAvailableForNewCosting } from "./validation.js";

const ZERO = decimalString("0");
const ONE = decimalString("1");
const money = (amount: DecimalString): Money => ({ currency: "BRL", amount });
export const getComponentCostResourceReference = (
  component: ProductComponent
) => ({
  type: component.type,
  id:
    component.type === "MATERIAL"
      ? component.materialId
      : component.type === "PROCESS"
        ? component.processDefinitionId
        : component.type === "OUTSOURCED_SERVICE"
          ? component.outsourcedServiceId
          : component.fixedCostDefinitionId,
});

function ensureAvailableReferences(
  expression: Expression,
  missing: ReadonlySet<string>
): void {
  const key = collectReferences(expression).find(reference =>
    missing.has(reference)
  );
  if (key)
    throw new CostingDomainError(
      "MISSING_TECHNICAL_INPUT",
      `Missing technical input: ${key}`,
      { key }
    );
}

function resourceFor(
  component: ProductComponent,
  bundles: readonly CostingResourceBundle[]
): CostingResourceBundle {
  const reference = getComponentCostResourceReference(component);
  const exact = bundles.filter(
    bundle =>
      bundle.definition.type === reference.type &&
      bundle.definition.id === reference.id
  );
  if (exact.length > 1)
    throw new CostingDomainError(
      "DUPLICATE_COST_RESOURCE",
      "Duplicate costing resource bundle",
      reference
    );
  if (exact.length === 1) return exact[0];
  const wrongType = bundles.some(
    bundle => bundle.definition.id === reference.id
  );
  throw new CostingDomainError(
    wrongType ? "COST_RESOURCE_REFERENCE_MISMATCH" : "COST_RESOURCE_NOT_FOUND",
    wrongType
      ? "Cost resource type does not match component"
      : "Cost resource was not found",
    reference
  );
}

/** Pure deterministic costing. The caller is responsible for authoritatively choosing effectiveCostAt. */
export function aggregateCosting(
  input: CostingAggregationInput
): CostingAggregateResult {
  const parsedInput = costingAggregationInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const invalidProductDefinition = parsedInput.error.issues.some(
      issue => issue.path[0] === "productDefinition"
    );
    throw new CostingDomainError(
      invalidProductDefinition
        ? "INVALID_PRODUCT_VERSION_DEFINITION"
        : "INVALID_COSTING_AGGREGATION_INPUT",
      invalidProductDefinition
        ? "Product version definition is not structurally valid"
        : "Costing aggregation input is not structurally valid"
    );
  }
  const parsed = parsedInput.data;
  if (!validateProductVersionForPublication(parsed.productDefinition).valid)
    throw new CostingDomainError(
      "INVALID_PRODUCT_VERSION_DEFINITION",
      "Product version definition is not publication-valid"
    );
  const definition = parsed.productDefinition;
  if (definition.version.status !== "PUBLISHED")
    throw new CostingDomainError(
      "PRODUCT_VERSION_NOT_PUBLISHED",
      "A new official costing requires a PUBLISHED product version"
    );
  if (compareDecimal(parsed.request.commercialQuantity, ZERO) <= 0)
    throw new CostingDomainError(
      "INVALID_COMMERCIAL_QUANTITY",
      "Commercial quantity must be greater than zero"
    );

  const bundleKeys = new Set<string>();
  for (const bundle of parsed.resources) {
    const key = `${bundle.definition.type}:${bundle.definition.id}`;
    if (bundleKeys.has(key))
      throw new CostingDomainError(
        "DUPLICATE_COST_RESOURCE",
        "Duplicate costing resource bundle",
        { type: bundle.definition.type, resourceId: bundle.definition.id }
      );
    bundleKeys.add(key);
  }
  const resolved = resolveTechnicalInputs(
    definition.inputs,
    parsed.request.technicalInputs
  );
  for (const variable of definition.variables)
    ensureAvailableReferences(variable.expression, resolved.missingOptional);
  const variables = evaluateVariables({
    inputs: resolved.values,
    variables: definition.variables,
  });
  const values: Readonly<Record<string, ExpressionValue>> = {
    ...resolved.values,
    ...variables,
  };
  const components: ComponentCostResult[] = [];
  let unitVariable = ZERO,
    fixed = ZERO,
    contributionTotal = ZERO;

  for (const component of [...definition.components].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)
  )) {
    const reference = getComponentCostResourceReference(component);
    let conditionResult = true;
    if (component.condition != null) {
      ensureAvailableReferences(component.condition, resolved.missingOptional);
      const condition = evaluateExpression(component.condition, { values });
      if (condition.kind !== "boolean")
        throw new CostingDomainError(
          "INVALID_COMPONENT_CONDITION_RESULT",
          "Component condition must return BOOLEAN",
          { componentId: component.id }
        );
      conditionResult = condition.value;
    }
    if (!conditionResult) {
      components.push({
        componentId: component.id,
        componentType: component.type,
        label: component.label,
        quantityScope: component.quantityScope,
        included: false,
        conditionResult: false,
        resourceReference: reference,
        baseCost: money(ZERO),
        unitVariableCostContribution: money(ZERO),
        quoteItemFixedCostContribution: money(ZERO),
        totalCostContribution: money(ZERO),
      });
      continue;
    }
    ensureAvailableReferences(
      component.quantityExpression,
      resolved.missingOptional
    );
    const quantity = evaluateExpression(component.quantityExpression, {
      values,
    });
    if (quantity.kind !== "decimal" || quantity.unit === null)
      throw new CostingDomainError(
        "INVALID_COMPONENT_QUANTITY_RESULT",
        "Component quantity must return a dimensional DECIMAL",
        { componentId: component.id }
      );
    if (!costableUnitIdSchema.safeParse(component.quantityUnit).success)
      throw new CostingDomainError(
        "INVALID_COST_QUANTITY_UNIT",
        "Component quantity unit is not costable",
        { componentId: component.id, unit: component.quantityUnit }
      );
    let engineeringAmount: DecimalString;
    try {
      engineeringAmount = convertUnit(
        quantity.value,
        quantity.unit,
        component.quantityUnit
      );
    } catch (error) {
      throw new CostingDomainError(
        "INCOMPATIBLE_COST_UNIT",
        "Component quantity cannot be normalized",
        {
          componentId: component.id,
          cause: error instanceof Error ? error.message : String(error),
        }
      );
    }
    if (compareDecimal(engineeringAmount, ZERO) < 0)
      throw new CostingDomainError(
        "NEGATIVE_COMPONENT_QUANTITY",
        "Component quantity cannot be negative",
        { componentId: component.id }
      );
    const bundle = resourceFor(component, parsed.resources);
    assertResourceAvailableForNewCosting(bundle.definition);
    const rate = resolveEffectiveCostRate(
      bundle.definition,
      bundle.rates,
      parsed.effectiveCostAt
    );
    const costAmount = convertCostQuantity(
      engineeringAmount,
      component.quantityUnit,
      bundle.definition.costUnit
    );
    const baseAmount = multiplyDecimal(costAmount, rate.amount);
    const perUnit = component.quantityScope === "PER_UNIT" ? baseAmount : ZERO;
    const perItem =
      component.quantityScope === "PER_QUOTE_ITEM" ? baseAmount : ZERO;
    const multiplier =
      component.quantityScope === "PER_UNIT"
        ? parsed.request.commercialQuantity
        : ONE;
    const total = multiplyDecimal(baseAmount, multiplier);
    unitVariable = addDecimal(unitVariable, perUnit);
    fixed = addDecimal(fixed, perItem);
    contributionTotal = addDecimal(contributionTotal, total);
    components.push({
      componentId: component.id,
      componentType: component.type,
      label: component.label,
      quantityScope: component.quantityScope,
      included: true,
      conditionResult: true,
      resourceReference: reference,
      resource: bundle.definition,
      rate,
      engineeringQuantity: {
        amount: engineeringAmount,
        unit: component.quantityUnit,
      },
      costQuantity: { amount: costAmount, unit: bundle.definition.costUnit },
      expansion: {
        owner: QUANTITY_EXPANSION_OWNER,
        multiplier,
        commercialQuantity: parsed.request.commercialQuantity,
      },
      expandedCostQuantity: {
        amount: multiplyDecimal(costAmount, multiplier),
        unit: bundle.definition.costUnit,
      },
      baseCost: money(baseAmount),
      unitVariableCostContribution: money(perUnit),
      quoteItemFixedCostContribution: money(perItem),
      totalCostContribution: money(total),
    });
  }
  const total = addDecimal(
    multiplyDecimal(unitVariable, parsed.request.commercialQuantity),
    fixed
  );
  if (compareDecimal(total, contributionTotal) !== 0)
    throw new CostingDomainError(
      "COSTING_AGGREGATION_INCONSISTENT",
      "Component contributions do not equal aggregate total"
    );
  return {
    aggregationVersion: COSTING_AGGREGATION_VERSION,
    productId: definition.version.productId,
    productVersionId: definition.version.id,
    productVersionNumber: definition.version.versionNumber,
    productVersionRevision: definition.version.revision,
    effectiveCostAt: parsed.effectiveCostAt,
    commercialQuantity: parsed.request.commercialQuantity,
    resolvedInputs: resolved.resolvedInputs,
    components,
    unitVariableCost: money(unitVariable),
    quoteItemFixedCost: money(fixed),
    totalCost: money(total),
  };
}
