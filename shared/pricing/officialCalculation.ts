import { z } from "zod";
import { moneySchema } from "../calculation-engine/contracts/index.js";
import { calculationRequestSchema } from "../calculation-engine/contracts/index.js";
import { decimalStringSchema } from "../calculation-engine/decimal/index.js";
import { productIdSchema } from "../product-engineering/product.js";
import { productVersionIdSchema } from "../product-engineering/productVersion.js";
import { PRICING_COMMERCIAL_ROUNDING } from "./commercial.js";

export const OFFICIAL_PRICING_CALCULATION_VERSION = "1.0" as const;

export const officialPricingRequestSchema = z
  .object({
    productVersionId: productVersionIdSchema,
    request: calculationRequestSchema,
    installments: z.number().int().min(1).max(12),
  })
  .strict();

export type OfficialPricingRequest = z.infer<
  typeof officialPricingRequestSchema
>;

export const officialPricingApiRequestSchema = officialPricingRequestSchema
  .extend({
    action: z.literal("CALCULATE"),
  })
  .strict();

export type OfficialPricingApiRequest = z.infer<
  typeof officialPricingApiRequestSchema
>;

const roundedMoneySchema = z
  .object(moneySchema.shape)
  .strict()
  .refine(
    value => /^\d+\.\d{2}$/.test(value.amount),
    "Official commercial price must have exactly two decimal places"
  );

export const officialPricingPublicResultSchema = z
  .object({
    calculationVersion: z.literal(OFFICIAL_PRICING_CALCULATION_VERSION),
    productId: productIdSchema,
    productVersionId: productVersionIdSchema,
    productVersionNumber: z.number().int().positive(),
    productVersionRevision: z.number().int().positive(),
    commercialQuantity: decimalStringSchema,
    installments: z.number().int().min(1).max(12),
    roundingRule: z.literal(PRICING_COMMERCIAL_ROUNDING),
    totalSellingPrice: roundedMoneySchema,
  })
  .strict();

export type OfficialPricingPublicResult = z.infer<
  typeof officialPricingPublicResultSchema
>;
