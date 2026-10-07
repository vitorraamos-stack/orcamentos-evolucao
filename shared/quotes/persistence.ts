import { z } from "zod";
import {
  officialQuoteRequestSchema,
  officialQuotePublicResultSchema,
  quoteInstallationRequestSchema,
  quoteMunckRequestSchema,
} from "./calculation.js";
import {
  calculationRequestSchema,
  moneySchema,
} from "../calculation-engine/contracts/index.js";
import { productIdSchema } from "../product-engineering/product.js";
import { productVersionIdSchema } from "../product-engineering/productVersion.js";

export const QUOTE_STATUSES = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "CANCELLED",
] as const;

export const quoteStatusSchema = z.enum(QUOTE_STATUSES);
export type QuoteStatus = z.infer<typeof quoteStatusSchema>;

export const quoteIdSchema = z.string().uuid().brand<"QuoteId">();
export type QuoteId = z.infer<typeof quoteIdSchema>;

export const quoteSnapshotIdSchema = z.string().uuid().brand<"QuoteSnapshotId">();
export type QuoteSnapshotId = z.infer<typeof quoteSnapshotIdSchema>;

export const quoteCommercialDetailsSchema = z
  .object({
    customerName: z.string().trim().min(1).max(160),
    customerPhone: z.string().trim().min(3).max(40).nullable(),
    title: z.string().trim().min(1).max(200),
  })
  .strict();
export type QuoteCommercialDetails = z.infer<
  typeof quoteCommercialDetailsSchema
>;

const quoteNumberSchema = z.number().int().positive();
const quoteRevisionSchema = z.number().int().positive();
const quoteSnapshotVersionSchema = z.number().int().positive();
const timestampSchema = z.string().min(1);

const quoteSaveFields = {
  quoteId: quoteIdSchema.nullable(),
  expectedRevision: quoteRevisionSchema.nullable(),
  commercial: quoteCommercialDetailsSchema,
  productVersionId: productVersionIdSchema,
  request: calculationRequestSchema,
  installments: z.number().int().min(1).max(12),
  installation: quoteInstallationRequestSchema,
  munck: quoteMunckRequestSchema,
} as const;

const validateSaveRevision = (
  value: { quoteId: string | null; expectedRevision: number | null },
  ctx: z.RefinementCtx
) => {
  const creating = value.quoteId === null;
  if (creating && value.expectedRevision !== null)
    ctx.addIssue({
      code: "custom",
      path: ["expectedRevision"],
      message: "New Quotes cannot declare an expected revision",
    });
  if (!creating && value.expectedRevision === null)
    ctx.addIssue({
      code: "custom",
      path: ["expectedRevision"],
      message: "Existing Quotes require an expected revision",
    });
};

export const quoteSaveRequestSchema = z
  .object(quoteSaveFields)
  .strict()
  .superRefine(validateSaveRevision);

export type QuoteSaveRequest = z.infer<typeof quoteSaveRequestSchema>;

export const quoteSaveApiRequestSchema = z
  .object({
    action: z.literal("SAVE_QUOTE"),
    ...quoteSaveFields,
  })
  .strict()
  .superRefine(validateSaveRevision);

export const quoteGetApiRequestSchema = z
  .object({
    action: z.literal("GET_QUOTE"),
    quoteId: quoteIdSchema,
  })
  .strict();

export const quoteListApiRequestSchema = z
  .object({
    action: z.literal("LIST_QUOTES"),
    page: z.number().int().positive(),
    pageSize: z.number().int().min(10).max(100),
    search: z.string().trim().max(120).nullable(),
    status: quoteStatusSchema.nullable(),
  })
  .strict();

export const quoteTransitionApiRequestSchema = z
  .object({
    action: z.literal("TRANSITION_QUOTE"),
    quoteId: quoteIdSchema,
    expectedRevision: quoteRevisionSchema,
    targetStatus: quoteStatusSchema,
  })
  .strict();

export const quotePersistedSummarySchema = z
  .object({
    quoteId: quoteIdSchema,
    quoteNumber: quoteNumberSchema,
    status: quoteStatusSchema,
    revision: quoteRevisionSchema,
    snapshotId: quoteSnapshotIdSchema,
    snapshotVersion: quoteSnapshotVersionSchema,
    savedAt: timestampSchema,
    commercial: quoteCommercialDetailsSchema,
  })
  .strict();

export type QuotePersistedSummary = z.infer<
  typeof quotePersistedSummarySchema
>;

export const quoteSavePublicResultSchema = quotePersistedSummarySchema
  .extend({
    publicResult: officialQuotePublicResultSchema,
  })
  .strict();

export type QuoteSavePublicResult = z.infer<
  typeof quoteSavePublicResultSchema
>;

export const quoteCurrentPublicResultSchema = quotePersistedSummarySchema
  .extend({
    request: officialQuoteRequestSchema,
    publicResult: officialQuotePublicResultSchema,
  })
  .strict();

export type QuoteCurrentPublicResult = z.infer<
  typeof quoteCurrentPublicResultSchema
>;

export const quoteListItemSchema = z
  .object({
    quoteId: quoteIdSchema,
    quoteNumber: quoteNumberSchema,
    status: quoteStatusSchema,
    revision: quoteRevisionSchema,
    commercial: quoteCommercialDetailsSchema,
    snapshotVersion: quoteSnapshotVersionSchema,
    totalSellingPrice: moneySchema,
    installments: z.number().int().min(1).max(12),
    productId: productIdSchema,
    productName: z.string().trim().min(1),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    createdBy: z.string().uuid(),
    createdByEmail: z.string().email().nullable(),
  })
  .strict();

export type QuoteListItem = z.infer<typeof quoteListItemSchema>;

export const quoteListResultSchema = z
  .object({
    items: z.array(quoteListItemSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().min(10).max(100),
  })
  .strict();

export type QuoteListResult = z.infer<typeof quoteListResultSchema>;

export const quoteTransitionResultSchema = z
  .object({
    quoteId: quoteIdSchema,
    quoteNumber: quoteNumberSchema,
    status: quoteStatusSchema,
    revision: quoteRevisionSchema,
    snapshotId: quoteSnapshotIdSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export type QuoteTransitionResult = z.infer<
  typeof quoteTransitionResultSchema
>;
