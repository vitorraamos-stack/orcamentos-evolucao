import { z } from "zod";
import { configurableKeySchema } from "../calculation-engine/contracts/index.js";
import {
  decimalFrom,
  decimalStringSchema,
} from "../calculation-engine/decimal/index.js";
import { UNIT_IDS } from "../calculation-engine/units/index.js";
import { productIdSchema } from "../product-engineering/product.js";
import { costTimestampSchema } from "./rates.js";

const actorIdSchema = z.string().uuid();
const revisionSchema = z.number().int().positive();

export const productCostingParameterSchema = z
  .object({
    productId: productIdSchema,
    key: configurableKeySchema,
    label: z.string().trim().min(1),
    description: z.string().nullable(),
    value: decimalStringSchema,
    unit: z.enum(UNIT_IDS).nullable(),
    minValue: decimalStringSchema.nullable(),
    maxValue: decimalStringSchema.nullable(),
    revision: revisionSchema,
    updatedAt: costTimestampSchema,
    updatedBy: actorIdSchema,
  })
  .strict()
  .superRefine((parameter, ctx) => {
    try {
      const value = decimalFrom(parameter.value);
      if (
        parameter.minValue !== null &&
        value.lessThan(decimalFrom(parameter.minValue))
      )
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: "Parameter value is below its minimum",
        });
      if (
        parameter.maxValue !== null &&
        value.greaterThan(decimalFrom(parameter.maxValue))
      )
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: "Parameter value is above its maximum",
        });
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Invalid product Costing parameter",
      });
    }
  });

export type ProductCostingParameter = z.infer<
  typeof productCostingParameterSchema
>;
