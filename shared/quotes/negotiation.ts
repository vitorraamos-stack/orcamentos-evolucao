import { z } from "zod";
import { moneySchema } from "../calculation-engine/contracts/index.js";
import {
  compareDecimal,
  decimalFrom,
  decimalString,
  decimalStringSchema,
  subtractDecimal,
  type DecimalString,
} from "../calculation-engine/decimal/index.js";

const roundedNonNegativeAmountSchema = decimalStringSchema.refine(value => {
  try {
    return (
      decimalFrom(value).greaterThanOrEqualTo("0") &&
      /^\d+\.\d{2}$/.test(value)
    );
  } catch {
    return false;
  }
}, "Amount must be a non-negative decimal with exactly two places");

export const quoteNegotiationRequestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("OFFICIAL") }).strict(),
  z
    .object({
      mode: z.literal("MANAGER_FINAL_PRICE"),
      finalAmount: roundedNonNegativeAmountSchema,
      reason: z.string().trim().min(5).max(500),
      allowBelowMinimum: z.boolean(),
    })
    .strict(),
]);

export type QuoteNegotiationRequest = z.infer<
  typeof quoteNegotiationRequestSchema
>;

export const quoteNegotiationEvaluationInputSchema = z
  .object({
    officialTotal: roundedNonNegativeAmountSchema,
    minimumAllowedTotal: roundedNonNegativeAmountSchema,
    negotiation: quoteNegotiationRequestSchema,
  })
  .strict();

const negotiationMoneySchema = z.object(moneySchema.shape).strict();

export const quoteNegotiationEvaluationSchema = z
  .object({
    mode: z.enum(["OFFICIAL", "MANAGER_FINAL_PRICE"]),
    officialTotal: negotiationMoneySchema,
    minimumAllowedTotal: negotiationMoneySchema,
    finalTotal: negotiationMoneySchema,
    adjustmentKind: z.enum(["NONE", "DISCOUNT", "SURCHARGE"]),
    adjustmentAmount: negotiationMoneySchema,
    belowMinimum: z.boolean(),
    belowMinimumOverride: z.boolean(),
    reason: z.string().trim().min(5).max(500).nullable(),
  })
  .strict();

export type QuoteNegotiationEvaluation = z.infer<
  typeof quoteNegotiationEvaluationSchema
>;

export const quoteNegotiationPublicResultSchema = z
  .object({
    pricingMode: z.enum(["OFFICIAL", "MANAGER_ADJUSTED"]),
    totalSellingPrice: negotiationMoneySchema,
  })
  .strict();

export type QuoteNegotiationPublicResult = z.infer<
  typeof quoteNegotiationPublicResultSchema
>;

export class QuoteNegotiationDomainError extends Error {
  constructor(
    readonly code:
      | "INVALID_QUOTE_NEGOTIATION"
      | "INVALID_QUOTE_NEGOTIATION_CONTEXT"
      | "BELOW_MINIMUM_OVERRIDE_REQUIRED"
      | "BELOW_MINIMUM_OVERRIDE_NOT_APPLICABLE",
    message: string
  ) {
    super(message);
    this.name = "QuoteNegotiationDomainError";
  }
}

const money = (amount: DecimalString) => ({
  currency: "BRL" as const,
  amount,
});

const fixedTwo = (value: DecimalString): DecimalString =>
  decimalString(decimalFrom(value).toFixed(2));

const zeroMoney = () => money(decimalString("0.00"));

export function evaluateQuoteNegotiation(
  input: unknown
): QuoteNegotiationEvaluation {
  const parsed = quoteNegotiationEvaluationInputSchema.safeParse(input);
  if (!parsed.success)
    throw new QuoteNegotiationDomainError(
      "INVALID_QUOTE_NEGOTIATION",
      "Invalid Quote negotiation input"
    );

  const { officialTotal, minimumAllowedTotal, negotiation } = parsed.data;
  if (compareDecimal(minimumAllowedTotal, officialTotal) > 0)
    throw new QuoteNegotiationDomainError(
      "INVALID_QUOTE_NEGOTIATION_CONTEXT",
      "Minimum allowed total cannot exceed the official total"
    );

  if (negotiation.mode === "OFFICIAL")
    return quoteNegotiationEvaluationSchema.parse({
      mode: "OFFICIAL",
      officialTotal: money(officialTotal),
      minimumAllowedTotal: money(minimumAllowedTotal),
      finalTotal: money(officialTotal),
      adjustmentKind: "NONE",
      adjustmentAmount: zeroMoney(),
      belowMinimum: false,
      belowMinimumOverride: false,
      reason: null,
    });

  const finalAmount = negotiation.finalAmount;
  const belowMinimum =
    compareDecimal(finalAmount, minimumAllowedTotal) < 0;

  if (belowMinimum && !negotiation.allowBelowMinimum)
    throw new QuoteNegotiationDomainError(
      "BELOW_MINIMUM_OVERRIDE_REQUIRED",
      "Selling below the configured minimum requires explicit override"
    );

  if (!belowMinimum && negotiation.allowBelowMinimum)
    throw new QuoteNegotiationDomainError(
      "BELOW_MINIMUM_OVERRIDE_NOT_APPLICABLE",
      "Below-minimum override may only be used below the configured minimum"
    );

  const comparison = compareDecimal(finalAmount, officialTotal);
  const adjustmentKind =
    comparison < 0 ? "DISCOUNT" : comparison > 0 ? "SURCHARGE" : "NONE";
  const adjustmentAmount =
    comparison < 0
      ? fixedTwo(subtractDecimal(officialTotal, finalAmount))
      : comparison > 0
        ? fixedTwo(subtractDecimal(finalAmount, officialTotal))
        : decimalString("0.00");

  return quoteNegotiationEvaluationSchema.parse({
    mode: "MANAGER_FINAL_PRICE",
    officialTotal: money(officialTotal),
    minimumAllowedTotal: money(minimumAllowedTotal),
    finalTotal: money(finalAmount),
    adjustmentKind,
    adjustmentAmount: money(adjustmentAmount),
    belowMinimum,
    belowMinimumOverride: belowMinimum,
    reason: negotiation.reason,
  });
}

export function toPublicQuoteNegotiation(
  evaluation: QuoteNegotiationEvaluation
): QuoteNegotiationPublicResult {
  return quoteNegotiationPublicResultSchema.parse({
    pricingMode:
      evaluation.mode === "OFFICIAL" ? "OFFICIAL" : "MANAGER_ADJUSTED",
    totalSellingPrice: evaluation.finalTotal,
  });
}
