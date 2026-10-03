import { z } from "zod";

/** A base-10 value kept as text at every contract boundary. */
export const decimalStringSchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/, "Invalid decimal string")
  .brand<"DecimalString">();

export type DecimalString = z.infer<typeof decimalStringSchema>;

/** Validates without ever coercing through JavaScript `number`. */
export function decimalString(value: string): DecimalString {
  return decimalStringSchema.parse(value);
}

export function isDecimalString(value: unknown): value is DecimalString {
  return decimalStringSchema.safeParse(value).success;
}

export * from "./arithmetic";
export * from "./engineDecimal";
