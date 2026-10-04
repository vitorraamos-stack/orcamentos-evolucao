import { z } from "zod";
import { quantityScopeSchema } from "../calculation-engine/contracts/index.js";
import { expressionSchema } from "../calculation-engine/expressions/index.js";
import { UNIT_IDS } from "../calculation-engine/units/index.js";

export const componentIdSchema = z.string().uuid().brand<"ComponentId">();
export type ComponentId = z.infer<typeof componentIdSchema>;
const base = {
  id: componentIdSchema,
  label: z.string().trim().min(1),
  sortOrder: z.number().int().nonnegative(),
  quantityScope: quantityScopeSchema,
  condition: expressionSchema.nullable().optional(),
  quantityExpression: expressionSchema,
  quantityUnit: z.enum(UNIT_IDS),
};
const resourceId = z.string().uuid();
export const productComponentSchema = z.discriminatedUnion("type", [
  z
    .object({ ...base, type: z.literal("MATERIAL"), materialId: resourceId })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("PROCESS"),
      processDefinitionId: resourceId,
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("OUTSOURCED_SERVICE"),
      outsourcedServiceId: resourceId,
    })
    .strict(),
  z
    .object({
      ...base,
      type: z.literal("FIXED_COST"),
      fixedCostDefinitionId: resourceId,
    })
    .strict(),
]);
export type ProductComponent = z.infer<typeof productComponentSchema>;
