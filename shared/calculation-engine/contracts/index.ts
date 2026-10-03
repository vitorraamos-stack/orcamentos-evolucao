import { z } from "zod";
import { decimalStringSchema, type DecimalString } from "../decimal";
import { UNIT_IDS, type UnitId } from "../units";
import { configurableKeySchema } from "./namespace";

export const moneySchema = z.object({
  currency: z.literal("BRL"),
  amount: decimalStringSchema,
});
export type Money = z.infer<typeof moneySchema>;

/** Serializable decimal supplied by an external caller; dimension is never trusted. */
export interface TechnicalDecimalInput {
  readonly kind: "decimal";
  readonly value: DecimalString;
  readonly unit: UnitId;
}
export interface BooleanValue {
  readonly kind: "boolean";
  readonly value: boolean;
}
export interface StringValue {
  readonly kind: "string";
  readonly value: string;
}
export type TechnicalInputValue =
  | TechnicalDecimalInput
  | BooleanValue
  | StringValue;

export const QUANTITY_SCOPES = ["PER_UNIT", "PER_QUOTE_ITEM"] as const;
export const quantityScopeSchema = z.enum(QUANTITY_SCOPES);
export type QuantityScope = z.infer<typeof quantityScopeSchema>;

export const QUANTITY_EXPANSION_OWNER = "COSTING_AGGREGATION" as const;
export type QuantityExpansionOwner = typeof QUANTITY_EXPANSION_OWNER;

const unitIdSchema = z.enum(UNIT_IDS);
export const technicalInputValueSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("decimal"),
      value: decimalStringSchema,
      unit: unitIdSchema,
    })
    .strict(),
  z.object({ kind: z.literal("boolean"), value: z.boolean() }).strict(),
  z.object({ kind: z.literal("string"), value: z.string() }).strict(),
]);

/** Quote-boundary envelope: commercial quantity cannot be confused with technical inputs. */
export const calculationRequestSchema = z
  .object({
    commercialQuantity: decimalStringSchema,
    technicalInputs: z.record(configurableKeySchema, technicalInputValueSchema),
  })
  .strict();
export type CalculationRequest = z.infer<typeof calculationRequestSchema>;

export * from "./namespace";
