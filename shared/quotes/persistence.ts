import { z } from "zod";
import {
  officialQuoteRequestSchema,
  officialQuotePublicResultSchema,
  quoteInstallationRequestSchema,
  quoteMunckRequestSchema,
} from "./calculation.js";
import { calculationRequestSchema } from "../calculation-engine/contracts/index.js";
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

const quoteNumberSchema = z.number().int().positive();
const quoteRevisionSchema = z.number().int().positive();
const quoteSnapshotVersionSchema = z.number().int().positive();
const timestampSchema = z.string().min(1);

export const quoteSaveRequestSchema = z
  .object({
    quoteId: quoteIdSchema.nullable(),
    expectedRevision: quoteRevisionSchema.nullable(),
    productVersionId: productVersionIdSchema,
    request: calculationRequestSchema,
    installments: z.number().int().min(1).max(12),
    installation: quoteInstallationRequestSchema,
    munck: quoteMunckRequestSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
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
  });

export type QuoteSaveRequest = z.infer<typeof quoteSaveRequestSchema>;

export const quoteSaveApiRequestSchema = quoteSaveRequestSchema
  .extend({ action: z.literal("SAVE_QUOTE") })
  .strict();

export const quoteGetApiRequestSchema = z
  .object({
    action: z.literal("GET_QUOTE"),
    quoteId: quoteIdSchema,
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
