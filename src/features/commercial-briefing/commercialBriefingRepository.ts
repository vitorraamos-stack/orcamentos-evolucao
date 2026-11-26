import { z } from "zod";
import { supabase } from "@/lib/supabase";
import {
  commercialBriefingDraftSchema,
  COMMERCIAL_BRIEFING_SCHEMA_VERSION,
  type CommercialBriefingDraft,
  type CommercialBriefingRecord,
} from "./commercialBriefingDomain";

// The persistence migration is installed in the existing project. The UI uses
// the authenticated client and never accepts owner or confirmation metadata.
const revisionSchema = z.number().int().positive();
const timestamp = z.string().min(1);
const externalId = z.string().trim().min(1).max(200);
const confirmationSchema = z.object({
  commercialRevision: revisionSchema,
  agreementKey: z.string().min(1),
  confirmedAt: timestamp,
  registeredBy: z.uuid(),
  evidenceReference: z.string().trim().min(1),
});
const rowSchema = z.object({
  id: z.uuid(),
  consultant_id: z.uuid(),
  digisac_contact_id: externalId,
  digisac_ticket_id: externalId.nullable(),
  context_verified_at: timestamp.nullable(),
  schema_version: z.literal(COMMERCIAL_BRIEFING_SCHEMA_VERSION),
  revision: revisionSchema,
  commercial_revision: revisionSchema,
  draft: commercialBriefingDraftSchema,
  confirmation: confirmationSchema.nullable(),
  os_id: z.uuid().nullable(),
  cancelled_at: timestamp.nullable(),
  created_at: timestamp,
  updated_at: timestamp,
}).refine(row => row.commercial_revision <= row.revision);

export type PersistedCommercialBriefing = CommercialBriefingRecord & {
  contextVerifiedAt: string | null;
};

export class CommercialBriefingRepositoryError extends Error {
  constructor(public readonly code: "conflict" | "forbidden" | "invalid" | "unavailable") {
    super({
      conflict: "O briefing foi atualizado. Recarregue antes de salvar novamente.",
      forbidden: "Sem permissão para acessar ou alterar o briefing.",
      invalid: "Revise os dados do briefing.",
      unavailable: "Não foi possível acessar o briefing comercial.",
    }[code]);
    this.name = "CommercialBriefingRepositoryError";
  }
}

function raiseDatabaseError(error: { code?: string }): never {
  if (error.code === "40001") throw new CommercialBriefingRepositoryError("conflict");
  if (error.code === "42501") throw new CommercialBriefingRepositoryError("forbidden");
  if (error.code === "22023") throw new CommercialBriefingRepositoryError("invalid");
  // Do not propagate SQL details or customer data in error messages.
  throw new CommercialBriefingRepositoryError("unavailable");
}

export function parseCommercialBriefingRow(raw: unknown): PersistedCommercialBriefing {
  // Support a single composite returned as an object or singleton array.
  const candidate = Array.isArray(raw) && raw.length === 1 ? raw[0] : raw;
  const parsed = rowSchema.safeParse(candidate);
  if (!parsed.success) throw new CommercialBriefingRepositoryError("unavailable");
  const r = parsed.data;
  return {
    id: r.id,
    consultantId: r.consultant_id,
    digisacContactId: r.digisac_contact_id,
    digisacTicketId: r.digisac_ticket_id,
    contextVerifiedAt: r.context_verified_at,
    schemaVersion: r.schema_version,
    revision: r.revision,
    commercialRevision: r.commercial_revision,
    draft: r.draft,
    confirmation: r.confirmation,
    osId: r.os_id,
    cancelledAt: r.cancelled_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const createInputSchema = z.strictObject({
  id: z.uuid(),
  contactId: externalId,
  ticketId: externalId.nullable(),
  draft: commercialBriefingDraftSchema,
});
const saveInputSchema = z.strictObject({
  id: z.uuid(),
  expectedRevision: revisionSchema,
  draft: commercialBriefingDraftSchema,
});
const cancelInputSchema = z.strictObject({
  id: z.uuid(),
  expectedRevision: revisionSchema,
});

export async function createCommercialBriefing(input: {
  id: string;
  contactId: string;
  ticketId: string | null;
  draft: CommercialBriefingDraft;
}): Promise<PersistedCommercialBriefing> {
  const parsed = createInputSchema.safeParse(input);
  if (!parsed.success) throw new CommercialBriefingRepositoryError("invalid");
  const { id, contactId, ticketId, draft } = parsed.data;
  // Keep the same generated id on retry; no caller-provided owner or status.
  const { data, error } = await supabase.rpc("commercial_briefing_create", {
    p_id: id,
    p_contact_id: contactId,
    p_ticket_id: ticketId,
    p_draft: draft,
  });
  if (error) raiseDatabaseError(error);
  return parseCommercialBriefingRow(data);
}

export async function saveCommercialBriefing(input: {
  id: string;
  expectedRevision: number;
  draft: CommercialBriefingDraft;
}): Promise<PersistedCommercialBriefing> {
  const parsed = saveInputSchema.safeParse(input);
  if (!parsed.success) throw new CommercialBriefingRepositoryError("invalid");
  const { id, expectedRevision, draft } = parsed.data;
  const { data, error } = await supabase.rpc("commercial_briefing_save", {
    p_id: id,
    p_expected_revision: expectedRevision,
    p_draft: draft,
  });
  if (error) raiseDatabaseError(error);
  return parseCommercialBriefingRow(data);
}

export async function cancelCommercialBriefing(input: {
  id: string;
  expectedRevision: number;
}): Promise<PersistedCommercialBriefing> {
  const parsed = cancelInputSchema.safeParse(input);
  if (!parsed.success) throw new CommercialBriefingRepositoryError("invalid");
  const { id, expectedRevision } = parsed.data;
  const { data, error } = await supabase.rpc("commercial_briefing_cancel", {
    p_id: id,
    p_expected_revision: expectedRevision,
  });
  if (error) raiseDatabaseError(error);
  return parseCommercialBriefingRow(data);
}

export async function getCommercialBriefing(id: string): Promise<PersistedCommercialBriefing | null> {
  if (!z.uuid().safeParse(id).success) throw new CommercialBriefingRepositoryError("invalid");
  const { data, error } = await supabase.from("commercial_briefings")
    .select("*").eq("id", id).maybeSingle();
  if (error) raiseDatabaseError(error);
  return data === null ? null : parseCommercialBriefingRow(data);
}

export async function listCommercialBriefings(input: {
  contactId: string;
  offset?: number;
}): Promise<PersistedCommercialBriefing[]> {
  const contact = externalId.safeParse(input.contactId);
  const offset = input.offset ?? 0;
  if (!contact.success || !Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000)
    throw new CommercialBriefingRepositoryError("invalid");
  const { data, error } = await supabase.from("commercial_briefings")
    .select("*").eq("digisac_contact_id", contact.data)
    .order("updated_at", { ascending: false }).order("id", { ascending: true })
    .range(offset, offset + 49);
  if (error) raiseDatabaseError(error);
  if (!Array.isArray(data)) throw new CommercialBriefingRepositoryError("unavailable");
  return data.map(parseCommercialBriefingRow);
}
