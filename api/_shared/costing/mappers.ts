import {
  costRateSchema,
  costTimestampSchema,
} from "../../../shared/costing/rates.js";
import {
  type CostResourceType,
  resourceDefinitionSchema,
} from "../../../shared/costing/resources.js";
import { productCostingParameterSchema } from "../../../shared/costing/productParameters.js";

export class CostingCompatibilityError extends Error {
  readonly code = "COSTING_COMPATIBILITY_ERROR";
}

const invalid = (): never => {
  throw new CostingCompatibilityError(
    "Costing persistence returned an incompatible payload."
  );
};

export function mapResourceRow(type: CostResourceType, row: any) {
  const parsed = resourceDefinitionSchema.safeParse({
    id: row?.id,
    type,
    code: row?.code,
    name: row?.name,
    description: row?.description,
    status: row?.status,
    costUnit: row?.cost_unit,
  });
  const timestamp = costTimestampSchema.safeParse(row?.updated_at);
  if (!parsed.success || !timestamp.success) return invalid();
  return { resource: parsed.data, updatedAt: timestamp.data };
}

export function mapResourceResult(value: any) {
  if (!value || typeof value !== "object") return invalid();
  return mapResourceRow(value.resource?.type, {
    id: value.resource?.id,
    code: value.resource?.code,
    name: value.resource?.name,
    description: value.resource?.description,
    status: value.resource?.status,
    cost_unit: value.resource?.costUnit,
    updated_at: value.updatedAt,
  });
}

export function mapRate(value: unknown) {
  // In particular, numeric JSON values are rejected rather than stringified.
  const parsed = costRateSchema.safeParse(value);
  if (!parsed.success) return invalid();
  return parsed.data;
}

export function mapRateSeries(value: unknown) {
  if (!Array.isArray(value)) return invalid();
  return value.map(mapRate);
}

export function mapProductCostingParameter(value: any) {
  const parsed = productCostingParameterSchema.safeParse({
    productId: value?.product_id,
    key: value?.key,
    label: value?.label,
    description: value?.description ?? null,
    value: value?.value,
    unit: value?.unit ?? null,
    minValue: value?.min_value ?? null,
    maxValue: value?.max_value ?? null,
    revision: value?.revision,
    updatedAt: value?.updated_at,
    updatedBy: value?.updated_by,
  });
  if (!parsed.success) return invalid();
  return parsed.data;
}

export function mapProductCostingParameters(value: unknown) {
  if (!Array.isArray(value)) return invalid();
  return value.map(mapProductCostingParameter);
}
