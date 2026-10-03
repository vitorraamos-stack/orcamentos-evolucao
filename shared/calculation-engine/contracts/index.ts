import { z } from "zod";
import { decimalStringSchema, type DecimalString } from "../decimal";
import type { Dimension } from "../units/dimensions";
import { UNIT_IDS, type UnitId } from "../units";
import { configurableKeySchema } from "./namespace";

export const moneySchema = z.object({
  currency: z.literal("BRL"),
  amount: decimalStringSchema,
});
export type Money = z.infer<typeof moneySchema>;

export interface DecimalValue {
  readonly kind: "decimal";
  readonly value: DecimalString;
  readonly unit: UnitId;
  readonly dimension: Dimension;
}
export interface BooleanValue {
  readonly kind: "boolean";
  readonly value: boolean;
}
export interface StringValue {
  readonly kind: "string";
  readonly value: string;
}
export type TypedValue = DecimalValue | BooleanValue | StringValue;

export const QUANTITY_SCOPES = ["PER_UNIT", "PER_QUOTE_ITEM"] as const;
export const quantityScopeSchema = z.enum(QUANTITY_SCOPES);
export type QuantityScope = z.infer<typeof quantityScopeSchema>;

export const QUANTITY_EXPANSION_OWNER = "COSTING_AGGREGATION" as const;
export type QuantityExpansionOwner = typeof QUANTITY_EXPANSION_OWNER;

const unitIdSchema = z.enum(UNIT_IDS);
const technicalInputValueSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("decimal"),
    value: decimalStringSchema,
    unit: unitIdSchema,
  }),
  z.object({ kind: z.literal("boolean"), value: z.boolean() }),
  z.object({ kind: z.literal("string"), value: z.string() }),
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
