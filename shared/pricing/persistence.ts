import { z } from "zod";
import {
  decimalFrom,
  decimalStringSchema,
} from "../calculation-engine/decimal/index.js";
import { productIdSchema } from "../product-engineering/product.js";
import {
  pricingMarkupSchema,
  pricingPolicyCodeSchema,
  pricingPolicyIdSchema,
  pricingPolicyStatusSchema,
  pricingPolicyVersionIdSchema,
  pricingRateSchema,
  pricingTimestampSchema,
} from "./contracts.js";

const revisionSchema = z.number().int().positive();
const actorIdSchema = z.string().uuid();

export const pricingNonNegativeAmountSchema = decimalStringSchema.refine(value => {
  try {
    return decimalFrom(value).greaterThanOrEqualTo("0");
  } catch {
    return false;
  }
}, "Pricing amount must be non-negative");

export const pricingPolicyAdminSchema = z
  .object({
    id: pricingPolicyIdSchema,
    code: pricingPolicyCodeSchema,
    name: z.string().trim().min(1),
    description: z.string().nullable().optional(),
    status: pricingPolicyStatusSchema,
    revision: revisionSchema,
    createdAt: pricingTimestampSchema,
    createdBy: actorIdSchema,
    updatedAt: pricingTimestampSchema,
    updatedBy: actorIdSchema,
  })
  .strict();
export type PricingPolicyAdmin = z.infer<typeof pricingPolicyAdminSchema>;

export const productPricingSettingsSchema = z
  .object({
    productId: productIdSchema,
    pricingPolicyId: pricingPolicyIdSchema,
    minimumSellingPrice: pricingNonNegativeAmountSchema,
    revision: revisionSchema,
    updatedAt: pricingTimestampSchema,
    updatedBy: actorIdSchema,
  })
  .strict();
export type ProductPricingSettings = z.infer<
  typeof productPricingSettingsSchema
>;

export const pricingPaymentTermSchema = z
  .object({
    installments: z.number().int().min(1).max(12),
    rate: pricingRateSchema,
    revision: revisionSchema,
    updatedAt: pricingTimestampSchema,
    updatedBy: actorIdSchema,
  })
  .strict()
  .superRefine((term, ctx) => {
    if (term.installments <= 3 && !decimalFrom(term.rate).isZero())
      ctx.addIssue({
        code: "custom",
        path: ["rate"],
        message: "Installments from 1 to 3 must have zero financial rate",
      });
  });
export type PricingPaymentTerm = z.infer<typeof pricingPaymentTermSchema>;

const nullableExpectedRevisionSchema = revisionSchema.nullable();

const createPolicyCommandSchema = z
  .object({
    action: z.literal("CREATE_POLICY"),
    policy: z
      .object({
        code: pricingPolicyCodeSchema,
        name: z.string().trim().min(1),
        description: z.string().nullable().optional(),
        status: z.enum(["ACTIVE", "INACTIVE"]),
      })
      .strict(),
    markup: pricingMarkupSchema,
    notes: z.string().nullable().optional(),
  })
  .strict();

const updatePolicyCommandSchema = z
  .object({
    action: z.literal("UPDATE_POLICY"),
    policyId: pricingPolicyIdSchema,
    expectedRevision: revisionSchema,
    policy: z
      .object({
        code: pricingPolicyCodeSchema,
        name: z.string().trim().min(1),
        description: z.string().nullable().optional(),
        status: z.enum(["ACTIVE", "INACTIVE"]),
      })
      .strict(),
  })
  .strict();

const archivePolicyCommandSchema = z
  .object({
    action: z.literal("ARCHIVE_POLICY"),
    policyId: pricingPolicyIdSchema,
    expectedRevision: revisionSchema,
  })
  .strict();

const createVersionCommandSchema = z
  .object({
    action: z.literal("CREATE_VERSION"),
    sourceVersionId: pricingPolicyVersionIdSchema,
    expectedRevision: revisionSchema,
  })
  .strict();

const saveDraftCommandSchema = z
  .object({
    action: z.literal("SAVE_DRAFT"),
    versionId: pricingPolicyVersionIdSchema,
    expectedRevision: revisionSchema,
    markup: pricingMarkupSchema,
    notes: z.string().nullable().optional(),
  })
  .strict();

const lifecycleCommand = (action: "START_VALIDATION" | "RETURN_TO_DRAFT") =>
  z
    .object({
      action: z.literal(action),
      versionId: pricingPolicyVersionIdSchema,
      expectedRevision: revisionSchema,
    })
    .strict();

const publishVersionCommandSchema = z
  .object({
    action: z.literal("PUBLISH_VERSION"),
    versionId: pricingPolicyVersionIdSchema,
    expectedRevision: revisionSchema,
    expectedCurrentPublishedVersionId: pricingPolicyVersionIdSchema.nullable(),
  })
  .strict();

const setProductPricingCommandSchema = z
  .object({
    action: z.literal("SET_PRODUCT_PRICING"),
    productId: productIdSchema,
    pricingPolicyId: pricingPolicyIdSchema,
    minimumSellingPrice: pricingNonNegativeAmountSchema,
    expectedRevision: nullableExpectedRevisionSchema,
  })
  .strict();

const setPaymentTermCommandSchema = z
  .object({
    action: z.literal("SET_PAYMENT_TERM"),
    installments: z.number().int().min(1).max(12),
    rate: pricingRateSchema,
    expectedRevision: nullableExpectedRevisionSchema,
  })
  .strict();

export const pricingPersistenceMutationSchema = z
  .discriminatedUnion("action", [
  createPolicyCommandSchema,
  updatePolicyCommandSchema,
  archivePolicyCommandSchema,
  createVersionCommandSchema,
  saveDraftCommandSchema,
  lifecycleCommand("START_VALIDATION"),
  lifecycleCommand("RETURN_TO_DRAFT"),
  publishVersionCommandSchema,
    setProductPricingCommandSchema,
    setPaymentTermCommandSchema,
  ])
  .superRefine((command, ctx) => {
    if (
      command.action === "SET_PAYMENT_TERM" &&
      command.installments <= 3 &&
      !decimalFrom(command.rate).isZero()
    )
      ctx.addIssue({
        code: "custom",
        path: ["rate"],
        message: "Installments from 1 to 3 must have zero financial rate",
      });
  });
export type PricingPersistenceMutation = z.infer<
  typeof pricingPersistenceMutationSchema
>;

export const pricingCreatePolicyResultSchema = z
  .object({
    policyId: pricingPolicyIdSchema,
    versionId: pricingPolicyVersionIdSchema,
    policyRevision: z.literal(1),
    versionRevision: z.literal(1),
  })
  .strict();

export const pricingCreateVersionResultSchema = z
  .object({
    pricingPolicyId: pricingPolicyIdSchema,
    sourceVersionId: pricingPolicyVersionIdSchema,
    versionId: pricingPolicyVersionIdSchema,
    versionNumber: z.number().int().positive(),
    revision: z.literal(1),
  })
  .strict();

export const pricingRevisionResultSchema = z
  .object({ revision: revisionSchema })
  .strict();
