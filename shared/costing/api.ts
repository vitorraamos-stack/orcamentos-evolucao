import { z } from "zod";
import { decimalStringSchema } from "../calculation-engine/decimal/index.js";
import { costTimestampSchema } from "./rates.js";
import {
  costResourceTypeSchema,
  resourceDefinitionSchema,
} from "./resources.js";
import { productIdSchema } from "../product-engineering/product.js";
import { configurableKeySchema } from "../calculation-engine/contracts/index.js";
import { costableUnitIdSchema } from "./units.js";
import { productCostingParameterSchema } from "./productParameters.js";

const uuidSchema = z.string().uuid();
const createResourceSchema = z
  .object({
    type: costResourceTypeSchema,
    code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    name: z.string().trim().min(1),
    description: z.string(),
    costUnit: costableUnitIdSchema,
  })
  .strict();

export const costingMutationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("CREATE_RESOURCE"),
      resource: createResourceSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("UPDATE_RESOURCE"),
      resource: resourceDefinitionSchema,
      expectedUpdatedAt: costTimestampSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("SET_CURRENT_RATE"),
      type: costResourceTypeSchema,
      resourceId: uuidSchema,
      amount: decimalStringSchema,
      effectiveFrom: costTimestampSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("UPSERT_PRODUCT_PARAMETER"),
      productId: productIdSchema,
      key: configurableKeySchema,
      label: productCostingParameterSchema.shape.label,
      description: productCostingParameterSchema.shape.description,
      value: decimalStringSchema,
      unit: productCostingParameterSchema.shape.unit,
      minValue: productCostingParameterSchema.shape.minValue,
      maxValue: productCostingParameterSchema.shape.maxValue,
      expectedRevision: z.number().int().positive().nullable(),
    })
    .strict(),
]);

export const costingQuerySchema = z.union([
  z
    .object({ type: costResourceTypeSchema, resourceId: uuidSchema.optional() })
    .strict(),
  z
    .object({
      productId: productIdSchema,
      scope: z.literal("PRODUCT_PARAMETERS"),
    })
    .strict(),
]);

export type CostingMutation = z.infer<typeof costingMutationSchema>;
export type CostingQuery = z.infer<typeof costingQuerySchema>;
export type CostingApiResponse<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: { code: string; message: string; issues?: readonly unknown[] };
    };
