import {
  aggregateCosting,
  costingResourceBundleSchema,
  getComponentCostResourceReference,
  type CostingAggregateResult,
  type CostingResourceBundle,
  type OfficialCostingRequest,
} from "../../../shared/costing/index.js";
import {
  costTimestampSchema,
  type CostTimestamp,
} from "../../../shared/costing/rates.js";
import type { CostResourceType } from "../../../shared/costing/resources.js";
import type { ProductCostingParameter } from "../../../shared/costing/productParameters.js";
import type { ProductVersionDefinition } from "../../../shared/product-engineering/index.js";

export type ServerClock = () => CostTimestamp;

export interface ProductDefinitionLoader {
  loadDefinition(versionId: string): Promise<ProductVersionDefinition>;
}

export interface CostResourceLoader {
  loadResource(
    type: CostResourceType,
    id: string
  ): Promise<{ resource: unknown; rates: unknown }>;
  loadProductParameters(productId: string): Promise<ProductCostingParameter[]>;
}

export class OfficialCostingCompatibilityError extends Error {
  readonly status = 500;
  readonly code = "INVALID_COSTING_AGGREGATION_INPUT";

  constructor() {
    super("Authoritative costing data is incompatible with its contract.");
  }
}

export const systemClock: ServerClock = () =>
  costTimestampSchema.parse(new Date().toISOString());

/** Loads every authoritative input, without evaluating or persisting the calculation. */
export class OfficialCostingCalculationService {
  constructor(
    private readonly productEngineering: ProductDefinitionLoader,
    private readonly costing: CostResourceLoader,
    private readonly clock: ServerClock = systemClock
  ) {}

  async calculate(
    input: OfficialCostingRequest
  ): Promise<CostingAggregateResult> {
    const effectiveCostAt = costTimestampSchema.safeParse(this.clock());
    if (!effectiveCostAt.success) throw new OfficialCostingCompatibilityError();

    const productDefinition = await this.productEngineering.loadDefinition(
      input.productVersionId
    );
    const parameterRows = await this.costing.loadProductParameters(
      productDefinition.version.productId
    );
    const inputKeys = new Set(productDefinition.inputs.map(item => item.key));
    const authoritativeTechnicalInputs = Object.fromEntries(
      parameterRows
        .filter(parameter => inputKeys.has(parameter.key))
        .map(parameter => [
          parameter.key,
          {
            kind: "decimal" as const,
            value: parameter.value,
            unit: parameter.unit,
          },
        ])
    );

    const unique = new Map<string, { type: CostResourceType; id: string }>();
    for (const component of productDefinition.components) {
      const reference = getComponentCostResourceReference(component);
      unique.set(`${reference.type}:${reference.id}`, reference);
    }
    const references = Array.from(unique.values()).sort(
      (left, right) =>
        left.type.localeCompare(right.type) || left.id.localeCompare(right.id)
    );
    const resources: CostingResourceBundle[] = [];
    for (const reference of references) {
      const loaded = await this.costing.loadResource(
        reference.type,
        reference.id
      );
      const bundle = costingResourceBundleSchema.safeParse({
        definition: loaded.resource,
        rates: loaded.rates,
      });
      if (!bundle.success) throw new OfficialCostingCompatibilityError();
      resources.push(bundle.data);
    }

    return aggregateCosting({
      productDefinition,
      request: input.request,
      authoritativeTechnicalInputs,
      resources,
      effectiveCostAt: effectiveCostAt.data,
    });
  }
}
