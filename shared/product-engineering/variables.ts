import { z } from "zod";
import { configurableKeySchema } from "../calculation-engine/contracts";
import { expressionSchema } from "../calculation-engine/expressions";
import { UNIT_IDS } from "../calculation-engine/units";

export const variableIdSchema = z.string().uuid().brand<"ProductVariableId">();
export const productVariableSchema = z
  .object({
    id: variableIdSchema,
    key: configurableKeySchema,
    label: z.string().trim().min(1),
    expression: expressionSchema,
    sortOrder: z.number().int().nonnegative(),
    expectedValueType: z.enum(["DECIMAL", "BOOLEAN", "STRING"]).optional(),
    expectedUnit: z.enum(UNIT_IDS).nullable().optional(),
  })
  .strict()
  .superRefine((variable, context) => {
    if (
      variable.expectedUnit != null &&
      variable.expectedValueType !== "DECIMAL"
    )
      context.addIssue({
        code: "custom",
        path: ["expectedUnit"],
        message: "Only DECIMAL variables may declare an expected unit",
      });
  });
export type ProductVariable = z.infer<typeof productVariableSchema>;
