import { z } from "zod";
import {
  calculationRequestSchema,
  type Money,
  type QuantityScope,
  type TechnicalInputValue,
} from "../calculation-engine/contracts/index.js";
import type { DecimalString } from "../calculation-engine/decimal/index.js";
import type { UnitId } from "../calculation-engine/units/index.js";
import { productVersionDefinitionSchema } from "../product-engineering/index.js";
import {
  costRateSchema,
  costTimestampSchema,
  type CostRate,
  type CostTimestamp,
} from "./rates.js";
import {
  resourceDefinitionSchema,
  type CostResourceType,
  type ResourceDefinition,
} from "./resources.js";

export const COSTING_AGGREGATION_VERSION = "1.0" as const;

export const costingResourceBundleSchema = z
  .object({
    definition: resourceDefinitionSchema,
    rates: z.array(costRateSchema).readonly(),
  })
  .strict();
export type CostingResourceBundle = z.infer<typeof costingResourceBundleSchema>;

/** `effectiveCostAt` is supplied by a future authoritative server layer, never by browser input. */
export const costingAggregationInputSchema = z
  .object({
    productDefinition: productVersionDefinitionSchema,
    request: calculationRequestSchema,
    resources: z.array(costingResourceBundleSchema).readonly(),
    effectiveCostAt: costTimestampSchema,
  })
  .strict();
export type CostingAggregationInput = z.infer<
  typeof costingAggregationInputSchema
>;

export interface ResolvedInput {
  readonly key: string;
  readonly value: TechnicalInputValue;
  readonly source: "PROVIDED" | "DEFAULT" | "CONFIGURATION";
}
export interface QuantitySnapshot {
  readonly amount: DecimalString;
  readonly unit: UnitId;
}
export interface ComponentCostResult {
  readonly componentId: string;
  readonly componentType: CostResourceType;
  readonly label: string;
  readonly quantityScope: QuantityScope;
  readonly included: boolean;
  readonly conditionResult: boolean;
  readonly resourceReference: {
    readonly type: CostResourceType;
    readonly id: string;
  };
  readonly resource?: ResourceDefinition;
  readonly rate?: CostRate;
  readonly engineeringQuantity?: QuantitySnapshot;
  readonly costQuantity?: QuantitySnapshot;
  readonly expansion?: {
    readonly owner: "COSTING_AGGREGATION";
    readonly multiplier: DecimalString;
    readonly commercialQuantity: DecimalString;
  };
  readonly expandedCostQuantity?: QuantitySnapshot;
  readonly baseCost: Money;
  readonly unitVariableCostContribution: Money;
  readonly quoteItemFixedCostContribution: Money;
  readonly totalCostContribution: Money;
}
export interface CostingAggregateResult {
  readonly aggregationVersion: typeof COSTING_AGGREGATION_VERSION;
  readonly productId: string;
  readonly productVersionId: string;
  readonly productVersionNumber: number;
  readonly productVersionRevision: number;
  readonly effectiveCostAt: CostTimestamp;
  readonly commercialQuantity: DecimalString;
  readonly resolvedInputs: readonly ResolvedInput[];
  readonly components: readonly ComponentCostResult[];
  readonly unitVariableCost: Money;
  readonly quoteItemFixedCost: Money;
  readonly totalCost: Money;
}
