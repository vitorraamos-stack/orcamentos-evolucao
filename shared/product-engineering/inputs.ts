import { z } from "zod";
import { configurableKeySchema } from "../calculation-engine/contracts";
import { decimalStringSchema } from "../calculation-engine/decimal";
import { UNIT_IDS } from "../calculation-engine/units";

export const inputIdSchema = z.string().uuid().brand<"ProductInputId">();
const base = {
  id: inputIdSchema,
  key: configurableKeySchema,
  label: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  required: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
};
const decimalInputSchema = z
  .object({
    ...base,
    type: z.literal("DECIMAL"),
    unit: z.enum(UNIT_IDS).nullable(),
    defaultValue: decimalStringSchema.optional(),
    min: decimalStringSchema.optional(),
    max: decimalStringSchema.optional(),
  })
  .strict();
const booleanInputSchema = z
  .object({
    ...base,
    type: z.literal("BOOLEAN"),
    defaultValue: z.boolean().optional(),
  })
  .strict();
export const selectOptionSchema = z
  .object({ value: z.string().min(1), label: z.string().trim().min(1) })
  .strict();
const selectInputSchema = z
  .object({
    ...base,
    type: z.literal("SELECT"),
    options: z.array(selectOptionSchema).min(1),
    defaultValue: z.string().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const values = input.options.map(option => option.value);
    if (new Set(values).size !== values.length)
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Select option values must be unique",
      });
    if (
      input.defaultValue !== undefined &&
      !values.includes(input.defaultValue)
    )
      context.addIssue({
        code: "custom",
        path: ["defaultValue"],
        message: "Default must reference an option value",
      });
  });
const textInputSchema = z
  .object({
    ...base,
    type: z.literal("TEXT"),
    defaultValue: z.string().optional(),
    maxLength: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.maxLength !== undefined &&
      input.defaultValue !== undefined &&
      input.defaultValue.length > input.maxLength
    )
      context.addIssue({
        code: "custom",
        path: ["defaultValue"],
        message: "Default exceeds maxLength",
      });
  });
export const productInputSchema = z.discriminatedUnion("type", [
  decimalInputSchema,
  booleanInputSchema,
  selectInputSchema,
  textInputSchema,
]);
export type ProductInput = z.infer<typeof productInputSchema>;
