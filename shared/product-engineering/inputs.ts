import { z } from "zod";
import { configurableKeySchema } from "../calculation-engine/contracts/index.js";
import {
  compareDecimal,
  decimalStringSchema,
} from "../calculation-engine/decimal/index.js";
import { UNIT_IDS } from "../calculation-engine/units/index.js";

export const inputIdSchema = z.string().uuid().brand<"ProductInputId">();
export const PRODUCT_INPUT_SCOPES = ["REQUEST", "CONFIGURATION"] as const;
export const productInputScopeSchema = z.enum(PRODUCT_INPUT_SCOPES);
export type ProductInputScope = z.infer<typeof productInputScopeSchema>;

const base = {
  id: inputIdSchema,
  key: configurableKeySchema,
  label: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  required: z.boolean(),
  scope: productInputScopeSchema.default("REQUEST"),
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
  .strict()
  .superRefine((input, context) => {
    if (
      input.min !== undefined &&
      input.max !== undefined &&
      compareDecimal(input.min, input.max) > 0
    )
      context.addIssue({
        code: "custom",
        path: ["max"],
        message: "Maximum must be greater than or equal to minimum",
      });
    if (
      input.defaultValue !== undefined &&
      input.min !== undefined &&
      compareDecimal(input.defaultValue, input.min) < 0
    )
      context.addIssue({
        code: "custom",
        path: ["defaultValue"],
        message: "Default must be greater than or equal to minimum",
      });
    if (
      input.defaultValue !== undefined &&
      input.max !== undefined &&
      compareDecimal(input.defaultValue, input.max) > 0
    )
      context.addIssue({
        code: "custom",
        path: ["defaultValue"],
        message: "Default must be less than or equal to maximum",
      });
  });
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
export const productInputSchema = z
  .discriminatedUnion("type", [
    decimalInputSchema,
    booleanInputSchema,
    selectInputSchema,
    textInputSchema,
  ])
  .superRefine((input, context) => {
    if (input.scope !== "CONFIGURATION") return;
    if (input.required)
      context.addIssue({
        code: "custom",
        path: ["required"],
        message: "Configuration inputs cannot require request-time values",
      });
    if (input.defaultValue === undefined)
      context.addIssue({
        code: "custom",
        path: ["defaultValue"],
        message: "Configuration inputs require a default value",
      });
  });
export type ProductInput = z.infer<typeof productInputSchema>;
