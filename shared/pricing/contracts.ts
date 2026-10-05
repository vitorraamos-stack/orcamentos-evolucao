import { z } from "zod";
import {
  decimalStringSchema,
  decimalFrom,
} from "../calculation-engine/decimal/index.js";
import { productSchema } from "../product-engineering/product.js";

export const pricingPolicyIdSchema = z
  .string()
  .uuid()
  .brand<"PricingPolicyId">();
export type PricingPolicyId = z.infer<typeof pricingPolicyIdSchema>;
export const pricingPolicyVersionIdSchema = z
  .string()
  .uuid()
  .brand<"PricingPolicyVersionId">();
export type PricingPolicyVersionId = z.infer<
  typeof pricingPolicyVersionIdSchema
>;
// Reuse the existing technical-code and strict timestamp primitives only.
export const pricingPolicyCodeSchema = productSchema.shape.code;
export const pricingTimestampSchema = productSchema.shape.createdAt;
export type PricingTimestamp = z.infer<typeof pricingTimestampSchema>;
export const PRICING_POLICY_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "ARCHIVED",
] as const;
export const pricingPolicyStatusSchema = z.enum(PRICING_POLICY_STATUSES);
export type PricingPolicyStatus = z.infer<typeof pricingPolicyStatusSchema>;
export const PRICING_POLICY_VERSION_STATUSES = [
  "DRAFT",
  "VALIDATING",
  "PUBLISHED",
  "RETIRED",
] as const;
export const pricingPolicyVersionStatusSchema = z.enum(
  PRICING_POLICY_VERSION_STATUSES
);
export type PricingPolicyVersionStatus = z.infer<
  typeof pricingPolicyVersionStatusSchema
>;

export const pricingPolicySchema = z
  .object({
    id: pricingPolicyIdSchema,
    code: pricingPolicyCodeSchema,
    name: z.string().trim().min(1),
    description: z.string().nullable().optional(),
    status: pricingPolicyStatusSchema,
  })
  .strict();
export type PricingPolicy = z.infer<typeof pricingPolicySchema>;

/** versionNumber identifies a commercial version; revision tracks edits to that version.
 * Published versions are immutable: future edits require a new version.
 * Publication uniqueness belongs to future persistence, not this contract.
 */
export const pricingPolicyVersionSchema = z
  .object({
    id: pricingPolicyVersionIdSchema,
    pricingPolicyId: pricingPolicyIdSchema,
    versionNumber: z.number().int().positive(),
    revision: z.number().int().positive(),
    status: pricingPolicyVersionStatusSchema,
    notes: z.string().nullable().optional(),
    createdAt: pricingTimestampSchema,
    createdBy: z.string().uuid(),
    publishedAt: pricingTimestampSchema.nullable(),
    publishedBy: z.string().uuid().nullable(),
  })
  .strict()
  .superRefine((version, ctx) => {
    const published =
      version.status === "PUBLISHED" || version.status === "RETIRED";
    if ((version.publishedAt === null) !== (version.publishedBy === null))
      ctx.addIssue({
        code: "custom",
        message: "publishedAt and publishedBy must both be set or null",
      });
    if (
      published &&
      (version.publishedAt === null || version.publishedBy === null)
    )
      ctx.addIssue({
        code: "custom",
        path: ["publishedAt"],
        message: "Published versions require publication metadata",
      });
    if (
      !published &&
      (version.publishedAt !== null || version.publishedBy !== null)
    )
      ctx.addIssue({
        code: "custom",
        path: ["publishedAt"],
        message:
          "Mutable or validating versions cannot have publication metadata",
      });
  });
export type PricingPolicyVersion = z.infer<typeof pricingPolicyVersionSchema>;

/** Fractional commercial rate, kept as DecimalString; presentation belongs to UI. */
export const pricingRateSchema = decimalStringSchema.refine(value => {
  try {
    const rate = decimalFrom(value);
    return rate.greaterThanOrEqualTo("0") && rate.lessThan("1");
  } catch {
    return false;
  }
}, "Pricing rate must satisfy 0 <= rate < 1");
export type PricingRate = z.infer<typeof pricingRateSchema>;

// Closed vocabulary only: no formula, default, or implicit percentage base.
export const PRICING_PERCENTAGE_BASES = [
  "TOTAL_COST",
  "SELLING_PRICE",
] as const;
export const pricingPercentageBaseSchema = z.enum(PRICING_PERCENTAGE_BASES);
export type PricingPercentageBase = z.infer<typeof pricingPercentageBaseSchema>;
export const PRICING_CHARGE_KINDS = [
  "TAX",
  "COMMISSION",
  "FINANCIAL_FEE",
  "OTHER",
] as const;
export const pricingChargeKindSchema = z.enum(PRICING_CHARGE_KINDS);
export type PricingChargeKind = z.infer<typeof pricingChargeKindSchema>;
export const PRICING_STRATEGY_TYPES = ["GROSS_UP", "MARKUP_ON_COST"] as const;
export const pricingStrategyTypeSchema = z.enum(PRICING_STRATEGY_TYPES);
export type PricingStrategyType = z.infer<typeof pricingStrategyTypeSchema>;
