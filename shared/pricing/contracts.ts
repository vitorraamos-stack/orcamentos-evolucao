import { z } from "zod";
import { moneySchema } from "../calculation-engine/contracts/index.js";
import {
  decimalStringSchema,
  decimalFrom,
} from "../calculation-engine/decimal/index.js";
import { COSTING_AGGREGATION_VERSION } from "../costing/aggregationContracts.js";
import { costTimestampSchema } from "../costing/rates.js";
import { productIdSchema } from "../product-engineering/product.js";
import {
  productVersionIdSchema,
} from "../product-engineering/productVersion.js";
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
export const pricingChargeIdSchema = z
  .string()
  .uuid()
  .brand<"PricingChargeId">();
export type PricingChargeId = z.infer<typeof pricingChargeIdSchema>;

// Reuse existing technical-code and strict timestamp primitives only.
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

/** versionNumber identifies a commercial version; revision tracks edits to that version. */
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

/** Fractional markup on an explicit cost base. Unlike PricingRate it may be >= 1. */
export const pricingMarkupSchema = decimalStringSchema.refine(value => {
  try {
    return decimalFrom(value).greaterThanOrEqualTo("0");
  } catch {
    return false;
  }
}, "Pricing markup must be a non-negative decimal");
export type PricingMarkup = z.infer<typeof pricingMarkupSchema>;

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
export const PRICING_MARKUP_BASES = [
  "TOTAL_COST",
  "COST_PLUS_COST_BASED_CHARGES",
] as const;
export const pricingMarkupBaseSchema = z.enum(PRICING_MARKUP_BASES);
export type PricingMarkupBase = z.infer<typeof pricingMarkupBaseSchema>;

export const MAX_PRICING_CHARGES = 64;
export const pricingChargeSchema = z
  .object({
    id: pricingChargeIdSchema,
    kind: pricingChargeKindSchema,
    rate: pricingRateSchema,
    percentageBase: pricingPercentageBaseSchema,
  })
  .strict();
export type PricingCharge = z.infer<typeof pricingChargeSchema>;

const grossUpStrategySchema = z
  .object({
    type: z.literal("GROSS_UP"),
    targetMargin: pricingRateSchema,
    marginBase: z.literal("SELLING_PRICE"),
  })
  .strict();
const markupOnCostStrategySchema = z
  .object({
    type: z.literal("MARKUP_ON_COST"),
    markup: pricingMarkupSchema,
    markupBase: pricingMarkupBaseSchema,
  })
  .strict();
export const pricingStrategySchema = z.discriminatedUnion("type", [
  grossUpStrategySchema,
  markupOnCostStrategySchema,
]);
export type PricingStrategy = z.infer<typeof pricingStrategySchema>;

export const pricingPolicyVersionDefinitionSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    version: pricingPolicyVersionSchema,
    strategy: pricingStrategySchema,
    charges: z.array(pricingChargeSchema).max(MAX_PRICING_CHARGES).readonly(),
  })
  .strict()
  .superRefine((definition, ctx) => {
    const seen = new Set<string>();
    for (let index = 0; index < definition.charges.length; index += 1) {
      const id = definition.charges[index].id;
      if (seen.has(id))
        ctx.addIssue({
          code: "custom",
          message: "DUPLICATE_PRICING_CHARGE",
          path: ["charges", index, "id"],
        });
      seen.add(id);
    }
  });
export type PricingPolicyVersionDefinition = z.infer<
  typeof pricingPolicyVersionDefinitionSchema
>;

const nonNegativeMoneySchema = z
  .object(moneySchema.shape)
  .strict()
  .refine(value => {
    try {
      return decimalFrom(value.amount).greaterThanOrEqualTo("0");
    } catch {
      return false;
    }
  }, "Money amount must be non-negative");

export const pricingCostBasisSchema = z
  .object({
    totalCost: nonNegativeMoneySchema,
    productId: productIdSchema,
    productVersionId: productVersionIdSchema,
    productVersionNumber: z.number().int().positive(),
    productVersionRevision: z.number().int().positive(),
    costingAggregationVersion: z.literal(COSTING_AGGREGATION_VERSION),
    effectiveCostAt: costTimestampSchema,
    commercialQuantity: decimalStringSchema.refine(value => {
      try {
        return decimalFrom(value).greaterThan("0");
      } catch {
        return false;
      }
    }, "Commercial quantity must be greater than zero"),
  })
  .strict();
export type PricingCostBasis = z.infer<typeof pricingCostBasisSchema>;

export const pricingEngineInputSchema = z
  .object({
    policy: pricingPolicySchema,
    definition: pricingPolicyVersionDefinitionSchema,
    costBasis: pricingCostBasisSchema,
  })
  .strict();
export type PricingEngineInput = z.infer<typeof pricingEngineInputSchema>;

export const PRICING_TECHNICAL_PRECISION = "DECIMAL_50_HALF_EVEN_V1" as const;
const pricingResultMoneySchema = nonNegativeMoneySchema;
const pricingRealizedMarginSchema = decimalStringSchema.refine(value => {
  try {
    const margin = decimalFrom(value);
    return margin.greaterThanOrEqualTo("0") && margin.lessThanOrEqualTo("1");
  } catch {
    return false;
  }
}, "Realized margin must satisfy 0 <= margin <= 1");
const pricingBreakdownSchema = z
  .object({
    totalCost: pricingResultMoneySchema,
    costBasedCharges: pricingResultMoneySchema,
    sellingPriceBasedCharges: pricingResultMoneySchema,
    profitAmount: pricingResultMoneySchema,
    realizedMargin: pricingRealizedMarginSchema.nullable(),
  })
  .strict();

export const pricingEngineResultSchema = z
  .object({
    engineVersion: z.literal("1.0"),
    schemaVersion: z.literal("1.0"),
    policyId: pricingPolicyIdSchema,
    policyVersionId: pricingPolicyVersionIdSchema,
    policyVersionNumber: z.number().int().positive(),
    policyVersionRevision: z.number().int().positive(),
    productId: productIdSchema,
    productVersionId: productVersionIdSchema,
    productVersionNumber: z.number().int().positive(),
    productVersionRevision: z.number().int().positive(),
    costingAggregationVersion: z.literal(COSTING_AGGREGATION_VERSION),
    effectiveCostAt: costTimestampSchema,
    commercialQuantity: decimalStringSchema,
    strategy: pricingStrategySchema,
    technicalPrecision: z.literal(PRICING_TECHNICAL_PRECISION),
    unroundedTotalSellingPrice: pricingResultMoneySchema,
    breakdown: pricingBreakdownSchema,
  })
  .strict();
export type PricingEngineResult = z.infer<typeof pricingEngineResultSchema>;

export const PRICING_PUBLICATION_ISSUE_CODES = [
  "INVALID_DEFINITION",
  "INVALID_VERSION_STATUS",
  "POLICY_VERSION_MISMATCH",
  "DUPLICATE_CHARGE",
  "INVALID_DENOMINATOR",
  "NUMERIC_LIMIT_EXCEEDED",
] as const;
export const pricingPublicationIssueCodeSchema = z.enum(
  PRICING_PUBLICATION_ISSUE_CODES
);
export type PricingPublicationIssueCode = z.infer<
  typeof pricingPublicationIssueCodeSchema
>;
export const pricingPublicationIssueSchema = z
  .object({
    code: pricingPublicationIssueCodeSchema,
    path: z.string().optional(),
  })
  .strict();
export const pricingPublicationValidationResultSchema = z
  .object({
    ready: z.boolean(),
    issues: z.array(pricingPublicationIssueSchema).readonly(),
  })
  .strict();
export type PricingPublicationValidationResult = z.infer<
  typeof pricingPublicationValidationResultSchema
>;
