import { z } from "zod";

const uuid = z.string().uuid();

export const commercialEligibilityRequestSchema = z.object({
  productId: uuid,
  commercialVersion: z.number().int().positive(),
  values: z.record(z.string(), z.unknown()).refine(v => Object.keys(v).length <= 50,
    "Too many commercial fields."),
  selectedComplementIds: z.array(z.string().min(1)).max(30),
  photosConfirmed: z.boolean(),
}).strict();

export const commercialEligibilityApiRequestSchema =
  commercialEligibilityRequestSchema.extend({
    action: z.literal("CHECK_COMMERCIAL_ELIGIBILITY"),
  }).strict();

export const commercialEligibilityStatusSchema = z.enum([
  "INCOMPLETE",
  "INVALID_COMBINATION",
  "TECHNICAL_PENDING",
  "PREPARATION_ONLY",
  "CALCULABLE",
]);

export const commercialEligibilityReasonSchema = z.enum([
  "MISSING_FIELDS",
  "INVALID_VALUES",
  "INVALID_COMPLEMENT",
  "TECHNICAL_REVIEW_REQUIRED",
  "SPECIAL_FIXING_REVIEW",
  "UNSUPPORTED_MAPPING",
  "VERSION_REVIEW_REQUIRED",
  "ENGINEERING_UNAVAILABLE",
  "PRICING_UNAVAILABLE",
]);

export const commercialEligibilityResultSchema = z.object({
  productId: uuid,
  libraryProductId: uuid,
  commercialVersion: z.number().int().positive(),
  engineeringVersion: z.object({
    id: uuid,
    number: z.number().int().positive(),
  }).strict().nullable(),
  status: commercialEligibilityStatusSchema,
  reasons: z.array(commercialEligibilityReasonSchema),
  missing: z.array(z.string()),
  technicalNotes: z.array(z.string()),
  canAttemptCalculation: z.boolean(),
  canTransfer: z.literal(false),
}).strict();

export type CommercialEligibilityRequest =
  z.infer<typeof commercialEligibilityRequestSchema>;
export type CommercialEligibilityResult =
  z.infer<typeof commercialEligibilityResultSchema>;
