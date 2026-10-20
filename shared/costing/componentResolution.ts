import type { CalculationRequest, TechnicalInputValue } from "../calculation-engine/contracts/index.js";
import { compareDecimal, decimalString } from "../calculation-engine/decimal/index.js";
import {
  collectReferences, evaluateExpression, evaluateVariables,
  type Expression, type ExpressionValue,
} from "../calculation-engine/expressions/index.js";
import {
  validateProductVersionForPublication,
  type ProductVersionDefinition,
  type ProductComponent,
} from "../product-engineering/index.js";
import type { ResolvedInput } from "./aggregationContracts.js";
import { CostingDomainError } from "./errors.js";
import { resolveTechnicalInputs } from "./inputResolution.js";

const ZERO = decimalString("0");

export function ensureAvailableReferences(
  expression: Expression, missing: ReadonlySet<string>
): void {
  const key = collectReferences(expression).find(reference => missing.has(reference));
  if (key)
    throw new CostingDomainError(
      "MISSING_TECHNICAL_INPUT", `Missing technical input: ${key}`, { key }
    );
}

export interface ResolvedCostingComponent {
  readonly component: ProductComponent;
  readonly included: boolean;
}

/**
 * Single, pure source of truth for component conditions. The server selects
 * which resources to fetch using this same function as the final aggregation.
 *
 * A TRUE condition includes even a component with a zero quantity, so its
 * resource and applicable rate are still required.
 */
export function resolveCostingComponentConditions(
  definition: ProductVersionDefinition,
  request: CalculationRequest,
  authoritativeTechnicalInputs: Readonly<Record<string, TechnicalInputValue>> = {}
): {
  readonly components: readonly ResolvedCostingComponent[];
  readonly resolvedInputs: readonly ResolvedInput[];
  readonly missingOptional: ReadonlySet<string>;
  readonly values: Readonly<Record<string, ExpressionValue>>;
} {
  if (!validateProductVersionForPublication(definition).valid)
    throw new CostingDomainError(
      "INVALID_PRODUCT_VERSION_DEFINITION",
      "Product version definition is not publication-valid"
    );
  if (definition.version.status !== "PUBLISHED")
    throw new CostingDomainError(
      "PRODUCT_VERSION_NOT_PUBLISHED",
      "A new official costing requires a PUBLISHED product version"
    );
  if (compareDecimal(request.commercialQuantity, ZERO) <= 0)
    throw new CostingDomainError(
      "INVALID_COMMERCIAL_QUANTITY",
      "Commercial quantity must be greater than zero"
    );

  const resolved = resolveTechnicalInputs(
    definition.inputs, request.technicalInputs, authoritativeTechnicalInputs
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
  const components = [...definition.components]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .map(component => {
      let included = true;
      if (component.condition != null) {
        ensureAvailableReferences(component.condition, resolved.missingOptional);
        const condition = evaluateExpression(component.condition, { values });
        if (condition.kind !== "boolean")
          throw new CostingDomainError(
            "INVALID_COMPONENT_CONDITION_RESULT",
            "Component condition must return BOOLEAN",
            { componentId: component.id }
          );
        included = condition.value;
      }
      return { component, included };
    });
  return {
    components,
    resolvedInputs: resolved.resolvedInputs,
    missingOptional: resolved.missingOptional,
    values,
  };
}
