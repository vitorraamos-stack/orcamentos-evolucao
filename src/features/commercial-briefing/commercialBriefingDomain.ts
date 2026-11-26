import { z } from "zod";
import {
  getCreateOrderCompletion,
  type CreateOrderItemDraft,
  type CreateOrderPrefill,
} from "@/features/hubos/createOrderDomain";
import {
  DELIVERY_DEADLINE_PRESET_CONFIG,
  DELIVERY_DEADLINE_PRESETS,
} from "@/features/hubos/deliveryDeadlineConfig";
import { ART_DIRECTION_CHOICES } from "@/features/hubos/orderUrgency";
import type { LogisticType } from "@/features/hubos/types";

export const COMMERCIAL_BRIEFING_SCHEMA_VERSION = 1;
export const COMMERCIAL_BRIEFING_LOGISTICS = [
  "retirada",
  "entrega",
  "instalacao",
] as const satisfies readonly LogisticType[];

// Incomplete or temporarily invalid numeric text can be saved as a draft.
// The shared OS schema remains responsible for validating the final values.
const draftNumber = z.union([z.number(), z.string().max(32)]);

export const commercialBriefingItemSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().max(160),
  quantity: draftNumber,
  width_cm: draftNumber.nullable(),
  height_cm: draftNumber.nullable(),
  measurement_unit: z.enum(["cm", "m"]),
  description: z.string().max(4000),
  notes: z.string().max(4000),
});

export const commercialBriefingDraftSchema = z.strictObject({
  saleNumber: z.string().max(100),
  clientName: z.string().max(250),
  items: z.array(commercialBriefingItemSchema).max(100),
  commercialNotes: z.string().max(4000),
  artInstructions: z.string().max(8000),
  artDirectionTag: z.enum(ART_DIRECTION_CHOICES).nullable(),
  isUrgent: z.boolean(),
  deadlinePreset: z.enum(DELIVERY_DEADLINE_PRESETS).nullable(),
  deliveryDate: z.string().max(10),
  logisticType: z.enum(COMMERCIAL_BRIEFING_LOGISTICS).nullable(),
  address: z.string().max(2000),
}).refine(
  draft => new Set(draft.items.map(item => item.id)).size === draft.items.length,
  { path: ["items"], message: "Identificadores de itens duplicados." }
);

export type CommercialBriefingItem = z.infer<typeof commercialBriefingItemSchema>;
export type CommercialBriefingDraft = z.infer<typeof commercialBriefingDraftSchema>;

// Persistence contract only. Ownership, revisions and confirmed evidence must
// be controlled by the authenticated server, not by an iframe query or draft.
export type CommercialBriefingRecord = {
  id: string;
  consultantId: string;
  digisacContactId: string;
  digisacTicketId: string | null;
  schemaVersion: typeof COMMERCIAL_BRIEFING_SCHEMA_VERSION;
  revision: number;
  commercialRevision: number;
  draft: CommercialBriefingDraft;
  confirmation: {
    commercialRevision: number;
    agreementKey: string;
    confirmedAt: string;
    registeredBy: string;
    evidenceReference: string;
  } | null;
  osId: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const emptyCommercialBriefing = (): CommercialBriefingDraft => ({
  saleNumber: "",
  clientName: "",
  items: [],
  commercialNotes: "",
  artInstructions: "",
  artDirectionTag: null,
  isUrgent: false,
  deadlinePreset: null,
  deliveryDate: "",
  logisticType: null,
  address: "",
});

export const emptyCommercialBriefingItem = (
  id: string
): CommercialBriefingItem =>
  commercialBriefingItemSchema.parse({
    id,
    name: "",
    quantity: "",
    width_cm: null,
    height_cm: null,
    measurement_unit: "cm",
    description: "",
    notes: "",
  });

const toOrderItem = (
  item: CommercialBriefingItem,
  index: number
): CreateOrderItemDraft => ({
  name: item.name,
  quantity: item.quantity,
  width_cm: item.width_cm,
  height_cm: item.height_cm,
  measurement_unit: item.measurement_unit,
  description: item.description,
  notes: item.notes,
  unit: "un",
  status: "PENDING",
  sort_order: index,
});

export function getCommercialBriefingCompletion(draft: CommercialBriefingDraft) {
  const shared = getCreateOrderCompletion({
    saleNumber: draft.saleNumber,
    clientName: draft.clientName,
    description: draft.artInstructions,
    items: draft.items.map(toOrderItem),
    artDirectionTag: draft.artDirectionTag,
    deadlinePreset: draft.deadlinePreset,
    deliveryDate: draft.deliveryDate,
    // The fallback is only for the existing helper; an unanswered logistics
    // selection is explicitly incomplete and never becomes pickup implicitly.
    logisticType: draft.logisticType ?? "retirada",
    address: draft.address,
  });

  return {
    customer: Boolean(draft.clientName.trim()),
    items: shared.items,
    artwork: shared.artwork,
    deadline: shared.deadline &&
      (draft.deadlinePreset !== "CUSTOM" ||
        z.iso.date().safeParse(draft.deliveryDate).success),
    logistics: draft.logisticType !== null && shared.logistics,
    sale: Boolean(draft.saleNumber.trim()),
    artInstructions: shared.briefing,
  };
}

export function canConfirmCommercialBriefing(draft: CommercialBriefingDraft) {
  if (!commercialBriefingDraftSchema.safeParse(draft).success) return false;
  const completion = getCommercialBriefingCompletion(draft);
  // A Conta Azul sale number and internal art instructions may be added later.
  return completion.customer && completion.items && completion.artwork &&
    completion.deadline && completion.logistics;
}

// Deterministic serialized customer-facing terms (not a hash). Treat as
// customer data; never put this value in URLs, telemetry or public logs.
// Internal art instructions, priority, sale number and item notes are excluded.
export function getCommercialAgreementKey(draft: CommercialBriefingDraft): string {
  return JSON.stringify({
    clientName: draft.clientName.trim(),
    items: draft.items.map(item => ({
      name: item.name.trim(),
      quantity: String(item.quantity).trim(),
      width: String(item.width_cm ?? "").trim(),
      height: String(item.height_cm ?? "").trim(),
      measurementUnit: item.measurement_unit,
      description: item.description.trim(),
    })),
    artDirectionTag: draft.artDirectionTag,
    deadlinePreset: draft.deadlinePreset,
    deadlineLabel: draft.deadlinePreset
      ? DELIVERY_DEADLINE_PRESET_CONFIG[draft.deadlinePreset].label
      : null,
    deliveryDate: draft.deadlinePreset === "CUSTOM" ? draft.deliveryDate : "",
    logisticType: draft.logisticType,
    address: draft.logisticType === "retirada" ? "" : draft.address.trim(),
    commercialNotes: draft.commercialNotes.trim(),
  });
}

export function hasCommercialAgreementChanged(
  previous: CommercialBriefingDraft,
  next: CommercialBriefingDraft
): boolean {
  return getCommercialAgreementKey(previous) !== getCommercialAgreementKey(next);
}

export function hasCurrentCommercialConfirmation(
  record: CommercialBriefingRecord
): boolean {
  const confirmation = record.confirmation;
  return Boolean(
    confirmation &&
    canConfirmCommercialBriefing(record.draft) &&
    confirmation.commercialRevision === record.commercialRevision &&
    confirmation.agreementKey === getCommercialAgreementKey(record.draft) &&
    confirmation.evidenceReference.trim()
  );
}

// Only a prefill for human review in the existing OS form. This does not
// authorize or execute a conversion, start a deadline, or create an OS.
export function buildCommercialBriefingOrderPrefill(
  input: unknown
): CreateOrderPrefill | null {
  const parsed = commercialBriefingDraftSchema.safeParse(input);
  if (!parsed.success) return null;
  const draft = parsed.data;
  if (!Object.values(getCommercialBriefingCompletion(draft)).every(Boolean) ||
      draft.logisticType === null) return null;

  const description = [
    draft.artInstructions.trim(),
    draft.commercialNotes.trim()
      ? "Observações comerciais acordadas:\n" + draft.commercialNotes.trim()
      : "",
  ].filter(Boolean).join("\n\n");

  return {
    saleNumber: draft.saleNumber.trim(),
    clientName: draft.clientName.trim(),
    description,
    deliveryDate: draft.deadlinePreset === "CUSTOM" ? draft.deliveryDate : "",
    deliveryDeadlinePreset: draft.deadlinePreset,
    logisticType: draft.logisticType,
    address: draft.logisticType === "retirada" ? "" : draft.address.trim(),
    selectedArtDirectionTag: draft.artDirectionTag,
    isUrgent: draft.isUrgent,
    items: draft.items.map(toOrderItem),
  };
}
