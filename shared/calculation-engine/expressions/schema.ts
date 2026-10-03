import { z } from "zod";
import { configurableKeySchema } from "../contracts";
import { decimalStringSchema } from "../decimal";
import { UNIT_IDS } from "../units";
import {
  BINARY_OPERATORS,
  EXPRESSION_FUNCTIONS,
  UNARY_OPERATORS,
  type Expression,
} from "./ast";

const unitSchema = z.enum(UNIT_IDS);
export const expressionSchema: z.ZodType<Expression> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z
      .object({
        type: z.literal("decimal_literal"),
        value: decimalStringSchema,
        unit: unitSchema.optional(),
      })
      .strict(),
    z
      .object({ type: z.literal("boolean_literal"), value: z.boolean() })
      .strict(),
    z.object({ type: z.literal("string_literal"), value: z.string() }).strict(),
    z
      .object({ type: z.literal("reference"), key: configurableKeySchema })
      .strict(),
    z
      .object({
        type: z.literal("unary"),
        operator: z.enum(UNARY_OPERATORS),
        operand: expressionSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal("binary"),
        operator: z.enum(BINARY_OPERATORS),
        left: expressionSchema,
        right: expressionSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal("call"),
        function: z.enum(EXPRESSION_FUNCTIONS),
        arguments: z.array(expressionSchema),
      })
      .strict(),
    z
      .object({
        type: z.literal("if"),
        condition: expressionSchema,
        then: expressionSchema,
        else: expressionSchema,
      })
      .strict(),
  ])
);
