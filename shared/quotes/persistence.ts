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
import {
  quoteNegotiationPublicResultSchema,
  quoteNegotiationRequestSchema,
  quotePricingModeSchema,
} from "./negotiation.js";

export const QUOTE_STATUSES = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "CANCELLED",
] as const;

export const quoteStatusSchema = z.enum(QUOTE_STATUSES);
export type QuoteStatus = z.infer<typeof quoteStatusSchema>;

export const QUOTE_OUTCOME_REASON_CODES = [
  "PRICE",
  "DEADLINE",
  "COMPETITOR",
  "NO_RESPONSE",
  "CLIENT_CANCELLED",
  "DUPLICATE",
  "CREATED_BY_MISTAKE",
  "SCOPE_CHANGED",
  "OTHER",
] as const;

export const quoteOutcomeReasonCodeSchema = z.enum(
  QUOTE_OUTCOME_REASON_CODES
);
export type QuoteOutcomeReasonCode = z.infer<
  typeof quoteOutcomeReasonCodeSchema
>;

export const quoteOutcomeReasonSchema = z
  .object({
    code: quoteOutcomeReasonCodeSchema,
    note: z.string().trim().min(1).max(300).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.code === "OTHER" &&
      (value.note === null || value.note.trim().length < 5)
    )
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: "OTHER outcome reasons require a note with at least 5 characters",
      });
  });

export type QuoteOutcomeReason = z.infer<typeof quoteOutcomeReasonSchema>;

export const QUOTE_REJECTION_REASON_CODES = [
  "PRICE",
  "DEADLINE",
  "COMPETITOR",
  "NO_RESPONSE",
  "CLIENT_CANCELLED",
  "OTHER",
] as const;

export const quoteRejectionReasonCodeSchema = z.enum(
  QUOTE_REJECTION_REASON_CODES
);
export type QuoteRejectionReasonCode = z.infer<
  typeof quoteRejectionReasonCodeSchema
>;

export const QUOTE_CANCELLATION_REASON_CODES = [
  "DUPLICATE",
  "CREATED_BY_MISTAKE",
  "SCOPE_CHANGED",
  "OTHER",
] as const;

const REJECTED_REASON_CODES = new Set<QuoteOutcomeReasonCode>(
  QUOTE_REJECTION_REASON_CODES
);

const CANCELLED_REASON_CODES = new Set<QuoteOutcomeReasonCode>(
  QUOTE_CANCELLATION_REASON_CODES
);

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
  negotiation: quoteNegotiationRequestSchema.optional(),
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

export const quoteMetricsApiRequestSchema = z
  .object({
    action: z.literal("GET_QUOTE_METRICS"),
  })
  .strict();

export const quoteTransitionApiRequestSchema = z
  .object({
    action: z.literal("TRANSITION_QUOTE"),
    quoteId: quoteIdSchema,
    expectedRevision: quoteRevisionSchema,
    targetStatus: quoteStatusSchema,
    outcomeReason: quoteOutcomeReasonSchema.nullable().optional().default(null),
  })
  .strict()
  .superRefine((value, ctx) => {
    const requiresOutcome =
      value.targetStatus === "REJECTED" ||
      value.targetStatus === "CANCELLED";

    if (requiresOutcome && value.outcomeReason === null) {
      ctx.addIssue({
        code: "custom",
        path: ["outcomeReason"],
        message: "Rejected and cancelled Quotes require an outcome reason",
      });
      return;
    }

    if (!requiresOutcome && value.outcomeReason !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["outcomeReason"],
        message: "This Quote transition cannot declare an outcome reason",
      });
      return;
    }

    if (
      value.targetStatus === "REJECTED" &&
      value.outcomeReason &&
      !REJECTED_REASON_CODES.has(value.outcomeReason.code)
    )
      ctx.addIssue({
        code: "custom",
        path: ["outcomeReason", "code"],
        message: "Invalid rejection reason",
      });

    if (
      value.targetStatus === "CANCELLED" &&
      value.outcomeReason &&
      !CANCELLED_REASON_CODES.has(value.outcomeReason.code)
    )
      ctx.addIssue({
        code: "custom",
        path: ["outcomeReason", "code"],
        message: "Invalid cancellation reason",
      });
  });

export const quoteHistoryApiRequestSchema = z
  .object({
    action: z.literal("GET_QUOTE_HISTORY"),
    quoteId: quoteIdSchema,
  })
  .strict();

export const QUOTE_EVENT_TYPES = [
  "QUOTE_CREATED",
  "SNAPSHOT_APPENDED",
  "STATUS_CHANGED",
] as const;

export const quoteEventTypeSchema = z.enum(QUOTE_EVENT_TYPES);
export type QuoteEventType = z.infer<typeof quoteEventTypeSchema>;

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
    negotiation: quoteNegotiationPublicResultSchema,
  })
  .strict();

export type QuoteSavePublicResult = z.infer<
  typeof quoteSavePublicResultSchema
>;

export const quoteCurrentPublicResultSchema = quotePersistedSummarySchema
  .extend({
    request: officialQuoteRequestSchema,
    publicResult: officialQuotePublicResultSchema,
    negotiation: quoteNegotiationPublicResultSchema,
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
    pricingMode: quotePricingModeSchema,
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

export const quoteLossReasonMetricSchema = z
  .object({
    code: quoteRejectionReasonCodeSchema,
    count: z.number().int().nonnegative(),
  })
  .strict();

export type QuoteLossReasonMetric = z.infer<
  typeof quoteLossReasonMetricSchema
>;

export const quoteCommercialMetricsSchema = z
  .object({
    totalQuotes: z.number().int().nonnegative(),
    draftQuotes: z.number().int().nonnegative(),
    sentQuotes: z.number().int().nonnegative(),
    openQuotes: z.number().int().nonnegative(),
    acceptedQuotes: z.number().int().nonnegative(),
    rejectedQuotes: z.number().int().nonnegative(),
    cancelledQuotes: z.number().int().nonnegative(),
    decidedQuotes: z.number().int().nonnegative(),
    conversionBps: z.number().int().min(0).max(10000),
    acceptedValue: moneySchema,
    rejectedWithoutReason: z.number().int().nonnegative(),
    lossReasons: z.array(quoteLossReasonMetricSchema).max(6),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.openQuotes !== value.draftQuotes + value.sentQuotes)
      ctx.addIssue({
        code: "custom",
        path: ["openQuotes"],
        message: "Open Quote count must equal DRAFT + SENT",
      });
    if (
      value.decidedQuotes !==
      value.acceptedQuotes + value.rejectedQuotes
    )
      ctx.addIssue({
        code: "custom",
        path: ["decidedQuotes"],
        message: "Decided Quote count must equal ACCEPTED + REJECTED",
      });
    if (
      value.totalQuotes !==
      value.openQuotes + value.decidedQuotes + value.cancelledQuotes
    )
      ctx.addIssue({
        code: "custom",
        path: ["totalQuotes"],
        message: "Quote metric counts are inconsistent",
      });
  });

export type QuoteCommercialMetrics = z.infer<
  typeof quoteCommercialMetricsSchema
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

export const quoteHistoryItemSchema = z
  .object({
    eventId: z.string().uuid(),
    eventType: quoteEventTypeSchema,
    occurredAt: timestampSchema,
    actorId: z.string().uuid(),
    actorEmail: z.string().email().nullable(),
    snapshotVersion: quoteSnapshotVersionSchema,
    pricingMode: quotePricingModeSchema,
    totalSellingPrice: moneySchema,
    fromStatus: quoteStatusSchema.nullable(),
    toStatus: quoteStatusSchema.nullable(),
    outcomeReason: quoteOutcomeReasonSchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const statusEvent = value.eventType === "STATUS_CHANGED";
    if (statusEvent && (!value.fromStatus || !value.toStatus))
      ctx.addIssue({
        code: "custom",
        path: ["fromStatus"],
        message: "Status history events require from/to status",
      });
    if (!statusEvent && (value.fromStatus !== null || value.toStatus !== null))
      ctx.addIssue({
        code: "custom",
        path: ["fromStatus"],
        message: "Non-status history events cannot declare status transition",
      });

    const outcomeStatus =
      statusEvent &&
      (value.toStatus === "REJECTED" || value.toStatus === "CANCELLED");
    if (!outcomeStatus && value.outcomeReason !== null)
      ctx.addIssue({
        code: "custom",
        path: ["outcomeReason"],
        message: "Only rejected or cancelled history events may declare an outcome reason",
      });
  });

export type QuoteHistoryItem = z.infer<typeof quoteHistoryItemSchema>;

export const quoteHistoryResultSchema = z
  .object({
    items: z.array(quoteHistoryItemSchema).max(200),
  })
  .strict();

export type QuoteHistoryResult = z.infer<typeof quoteHistoryResultSchema>;
