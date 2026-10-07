import { z } from "zod";
import {
  calculationRequestSchema,
  moneySchema,
} from "../calculation-engine/contracts/index.js";
import {
  addDecimal,
  compareDecimal,
  decimalFrom,
  decimalString,
  decimalStringSchema,
  maxDecimal,
  multiplyDecimal,
} from "../calculation-engine/decimal/index.js";
import { productIdSchema } from "../product-engineering/product.js";
import { productVersionIdSchema } from "../product-engineering/productVersion.js";
import {
  PRICING_COMMERCIAL_ROUNDING,
  calculateCommercialPricing,
} from "../pricing/commercial.js";
import { pricingRateSchema } from "../pricing/contracts.js";
import {
  pricingInstallationSettingsSchema,
  type PricingInstallationSettings,
} from "../pricing/installationSettings.js";

export const OFFICIAL_QUOTE_CALCULATION_VERSION = "1.0" as const;

const nonNegativeDecimalSchema = decimalStringSchema.refine(value => {
  try {
    return decimalFrom(value).greaterThanOrEqualTo("0");
  } catch {
    return false;
  }
}, "Value must be non-negative");

const positiveDecimalSchema = decimalStringSchema.refine(value => {
  try {
    return decimalFrom(value).greaterThan("0");
  } catch {
    return false;
  }
}, "Value must be greater than zero");

export const quoteInstallationRequestSchema = z.discriminatedUnion("requested", [
  z.object({ requested: z.literal(false) }).strict(),
  z.object({ requested: z.literal(true) }).strict(),
]);

export const quoteMunckRequestSchema = z.discriminatedUnion("requested", [
  z.object({ requested: z.literal(false) }).strict(),
  z
    .object({
      requested: z.literal(true),
      hours: positiveDecimalSchema,
    })
    .strict(),
]);

export const officialQuoteRequestSchema = z
  .object({
    productVersionId: productVersionIdSchema,
    request: calculationRequestSchema,
    installments: z.number().int().min(1).max(12),
    installation: quoteInstallationRequestSchema,
    munck: quoteMunckRequestSchema,
  })
  .strict();

export type OfficialQuoteRequest = z.infer<typeof officialQuoteRequestSchema>;

export const officialQuoteApiRequestSchema = officialQuoteRequestSchema
  .extend({ action: z.literal("CALCULATE_QUOTE") })
  .strict();

export type OfficialQuoteApiRequest = z.infer<
  typeof officialQuoteApiRequestSchema
>;

export const quoteCommercialInputSchema = z
  .object({
    productSellingPrice: nonNegativeDecimalSchema,
    financialRate: pricingRateSchema,
    installationRequested: z.boolean(),
    installationAreaM2: positiveDecimalSchema.nullable(),
    munckRequestedHours: positiveDecimalSchema.nullable(),
    settings: pricingInstallationSettingsSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.installationRequested && value.installationAreaM2 === null)
      ctx.addIssue({
        code: "custom",
        path: ["installationAreaM2"],
        message: "Installation area is required when installation is requested",
      });
  });

export type QuoteCommercialInput = z.infer<typeof quoteCommercialInputSchema>;

const quoteMoneySchema = z.object(moneySchema.shape).strict();
const roundedMoneySchema = quoteMoneySchema.refine(
  value => /^\d+\.\d{2}$/.test(value.amount),
  "Quote total must have exactly two decimal places"
);

export const quoteCommercialResultSchema = z
  .object({
    productSellingPrice: quoteMoneySchema,
    installation: z
      .object({
        requested: z.boolean(),
        areaM2: decimalStringSchema.nullable(),
        tier: z.enum(["TIER_1", "TIER_2", "TIER_3"]).nullable(),
        price: quoteMoneySchema,
      })
      .strict(),
    munck: z
      .object({
        requested: z.boolean(),
        requestedHours: decimalStringSchema.nullable(),
        billedHours: decimalStringSchema.nullable(),
        price: quoteMoneySchema,
      })
      .strict(),
    subtotalBeforeFinancialRate: quoteMoneySchema,
    roundingRule: z.literal(PRICING_COMMERCIAL_ROUNDING),
    totalSellingPrice: roundedMoneySchema,
  })
  .strict();

export type QuoteCommercialResult = z.infer<typeof quoteCommercialResultSchema>;

const money = (amount: z.infer<typeof decimalStringSchema>) => ({
  currency: "BRL" as const,
  amount,
});

export function calculateQuoteCommercial(
  input: unknown
): QuoteCommercialResult {
  const parsed = quoteCommercialInputSchema.parse(input);
  const zero = decimalString("0");

  let installationAreaM2: z.infer<typeof decimalStringSchema> | null = null;
  let installationTier: "TIER_1" | "TIER_2" | "TIER_3" | null = null;
  let installationPrice = zero;

  if (parsed.installationRequested) {
    installationAreaM2 = parsed.installationAreaM2!;
    if (
      compareDecimal(installationAreaM2, parsed.settings.tier1MaxAreaM2) <= 0
    ) {
      installationTier = "TIER_1";
      installationPrice = parsed.settings.tier1Price;
    } else if (
      compareDecimal(installationAreaM2, parsed.settings.tier2MaxAreaM2) <= 0
    ) {
      installationTier = "TIER_2";
      installationPrice = parsed.settings.tier2Price;
    } else {
      installationTier = "TIER_3";
      installationPrice = parsed.settings.tier3Price;
    }
  }

  const munckRequested = parsed.munckRequestedHours !== null;
  const munckBilledHours = munckRequested
    ? maxDecimal(
        parsed.munckRequestedHours!,
        parsed.settings.munckMinimumHours
      )
    : null;
  const munckPrice =
    munckBilledHours === null
      ? zero
      : multiplyDecimal(munckBilledHours, parsed.settings.munckHourlyPrice);

  const subtotal = addDecimal(
    addDecimal(parsed.productSellingPrice, installationPrice),
    munckPrice
  );

  const financed = calculateCommercialPricing({
    baseSellingPrice: subtotal,
    minimumSellingPrice: zero,
    financialRate: parsed.financialRate,
  });

  return quoteCommercialResultSchema.parse({
    productSellingPrice: money(parsed.productSellingPrice),
    installation: {
      requested: parsed.installationRequested,
      areaM2: installationAreaM2,
      tier: installationTier,
      price: money(installationPrice),
    },
    munck: {
      requested: munckRequested,
      requestedHours: parsed.munckRequestedHours,
      billedHours: munckBilledHours,
      price: money(munckPrice),
    },
    subtotalBeforeFinancialRate: money(subtotal),
    roundingRule: financed.roundingRule,
    totalSellingPrice: financed.totalSellingPrice,
  });
}

export const officialQuotePublicResultSchema = z
  .object({
    calculationVersion: z.literal(OFFICIAL_QUOTE_CALCULATION_VERSION),
    productId: productIdSchema,
    productVersionId: productVersionIdSchema,
    productVersionNumber: z.number().int().positive(),
    productVersionRevision: z.number().int().positive(),
    commercialQuantity: decimalStringSchema,
    installments: z.number().int().min(1).max(12),
    productSellingPrice: quoteMoneySchema,
    installation: quoteCommercialResultSchema.shape.installation,
    munck: quoteCommercialResultSchema.shape.munck,
    subtotalBeforeFinancialRate: quoteMoneySchema,
    roundingRule: z.literal(PRICING_COMMERCIAL_ROUNDING),
    totalSellingPrice: roundedMoneySchema,
  })
  .strict();

export type OfficialQuotePublicResult = z.infer<
  typeof officialQuotePublicResultSchema
>;

export function pricingInstallationSettings(
  value: PricingInstallationSettings
): PricingInstallationSettings {
  return pricingInstallationSettingsSchema.parse(value);
}
