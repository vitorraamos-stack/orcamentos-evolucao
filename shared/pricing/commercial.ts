import { z } from "zod";
import { moneySchema } from "../calculation-engine/contracts/index.js";
import {
  decimalFrom,
  decimalString,
  decimalStringSchema,
  type DecimalString,
} from "../calculation-engine/decimal/index.js";
import { PricingDomainError } from "./errors.js";
import {
  compareRational,
  divideRational,
  rationalFromDecimal,
  rationalOne,
  serializeRational,
  subtractRational,
  type ExactRational,
} from "./rational.js";
import { pricingRateSchema } from "./contracts.js";

export const PRICING_COMMERCIAL_ROUNDING =
  "BRL_2DP_HALF_UP_V1" as const;

const nonNegativeDecimalSchema = decimalStringSchema.refine(value => {
  try {
    return decimalFrom(value).greaterThanOrEqualTo("0");
  } catch {
    return false;
  }
}, "Commercial amount must be non-negative");

const commercialMoneySchema = z
  .object(moneySchema.shape)
  .strict()
  .refine(value => {
    try {
      return decimalFrom(value.amount).greaterThanOrEqualTo("0");
    } catch {
      return false;
    }
  }, "Commercial money must be non-negative");

export const commercialPricingInputSchema = z
  .object({
    baseSellingPrice: nonNegativeDecimalSchema,
    minimumSellingPrice: nonNegativeDecimalSchema,
    financialRate: pricingRateSchema,
  })
  .strict();

export type CommercialPricingInput = z.infer<
  typeof commercialPricingInputSchema
>;

export const commercialPricingResultSchema = z
  .object({
    roundingRule: z.literal(PRICING_COMMERCIAL_ROUNDING),
    minimumApplied: z.boolean(),
    baseSellingPrice: commercialMoneySchema,
    minimumSellingPrice: commercialMoneySchema,
    priceAfterMinimum: commercialMoneySchema,
    financialRate: pricingRateSchema,
    unroundedTotalSellingPrice: commercialMoneySchema,
    totalSellingPrice: commercialMoneySchema.refine(
      value => /^\d+\.\d{2}$/.test(value.amount),
      "Commercial selling price must have exactly two decimal places"
    ),
  })
  .strict();

export type CommercialPricingResult = z.infer<
  typeof commercialPricingResultSchema
>;

const HUNDRED = BigInt(100);
const TWO = BigInt(2);

function fixedTwoHalfUp(value: ExactRational): DecimalString {
  if (value.numerator < BigInt(0))
    throw new PricingDomainError(
      "INVALID_COMMERCIAL_PRICING_RESULT",
      "Commercial selling price cannot be negative"
    );

  const scaledNumerator = value.numerator * HUNDRED;
  let cents = scaledNumerator / value.denominator;
  const remainder = scaledNumerator % value.denominator;
  if (remainder * TWO >= value.denominator) cents += BigInt(1);

  const digits = cents.toString().padStart(3, "0");
  const serialized = `${digits.slice(0, -2)}.${digits.slice(-2)}`;
  try {
    const result = decimalString(serialized);
    decimalFrom(result);
    return result;
  } catch {
    throw new PricingDomainError(
      "INVALID_COMMERCIAL_PRICING_RESULT",
      "Commercial selling price cannot be represented"
    );
  }
}

const money = (amount: DecimalString) => ({
  currency: "BRL" as const,
  amount,
});

export function calculateCommercialPricing(
  input: unknown
): CommercialPricingResult {
  const parsed = commercialPricingInputSchema.safeParse(input);
  if (!parsed.success)
    throw new PricingDomainError(
      "INVALID_COMMERCIAL_PRICING_INPUT",
      "Invalid commercial pricing input"
    );

  const base = rationalFromDecimal(parsed.data.baseSellingPrice);
  const minimum = rationalFromDecimal(parsed.data.minimumSellingPrice);
  const minimumApplied = compareRational(minimum, base) > 0;
  const afterMinimum = minimumApplied ? minimum : base;

  const rate = rationalFromDecimal(parsed.data.financialRate);
  const denominator = subtractRational(rationalOne(), rate);
  if (compareRational(denominator, {
    numerator: BigInt(0),
    denominator: BigInt(1),
  }) <= 0)
    throw new PricingDomainError(
      "INVALID_PRICING_DENOMINATOR",
      "Financial rate denominator must be greater than zero"
    );

  const financed = divideRational(afterMinimum, denominator);
  const result = {
    roundingRule: PRICING_COMMERCIAL_ROUNDING,
    minimumApplied,
    baseSellingPrice: money(serializeRational(base)),
    minimumSellingPrice: money(serializeRational(minimum)),
    priceAfterMinimum: money(serializeRational(afterMinimum)),
    financialRate: parsed.data.financialRate,
    unroundedTotalSellingPrice: money(serializeRational(financed)),
    totalSellingPrice: money(fixedTwoHalfUp(financed)),
  };

  const validated = commercialPricingResultSchema.safeParse(result);
  if (!validated.success)
    throw new PricingDomainError(
      "INVALID_COMMERCIAL_PRICING_RESULT",
      "Invalid commercial pricing result"
    );
  return validated.data;
}
