import { supabase } from "@/lib/supabase";

/** Server preflight. These values NEVER authorize applying an old calendar. */
export type RetroApprovalPreflight = {
  request_id: string;
  calendar_version_id: string;
  exception_date: string;
  candidate_orders: number;
  stage_intervals: number;
  unverified_intervals: number;
  unlinked_intervals: number;
  recorded_pauses: number;
  incomplete_pauses: number;
  sector_revisions_to_check: number;
  thresholds_to_check: number;
  evidence_fingerprint: string;
  historical_coverage_verified: false;
  duration_impact_verified: false;
  alert_impact_verified: false;
  approval_allowed: false;
  application_allowed: false;
  reasons: string[];
};

export type RetroApprovalDossier = {
  id: string;
  request_id: string;
  snapshot: RetroApprovalPreflight;
  reason: string;
  status: "awaiting_server_verification";
  created_by: string;
  created_at: string;
};

function isSchemaUnavailable(error: { code?: string; message?: string } | null) {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" ||
    /dashboard_calendar_retro_approval_dossiers.*(not found|does not exist)/i
      .test(error.message ?? ""));
}

export async function listRetroApprovalDossiers(requestId: string): Promise<
  { state: "available"; rows: RetroApprovalDossier[] } |
  { state: "unavailable"; rows: [] }
> {
  const rows: RetroApprovalDossier[] = [];
  const pageSize = 250;
  let expected: number | null = null;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error, count } = await supabase.from("dashboard_calendar_retro_approval_dossiers")
      .select("id,request_id,snapshot,reason,status,created_by,created_at", { count: "exact" })
      .eq("request_id", requestId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (isSchemaUnavailable(error)) return { state: "unavailable", rows: [] };
    if (error) throw new Error(error.message || "Não foi possível consultar os encaminhamentos.");
    if (count === null || !Number.isSafeInteger(count) || count < 0)
      throw new Error("Contagem do histórico de aprovação indisponível.");
    if (expected === null) expected = count;
    if (expected !== count)
      throw new Error("O histórico de aprovação mudou durante a consulta. Atualize.");
    const page = (data ?? []) as RetroApprovalDossier[];
    if (page.length !== Math.min(pageSize, expected - offset))
      throw new Error("Histórico de aprovação incompleto. Atualize.");
    rows.push(...page);
    if (rows.length === expected) return { state: "available", rows };
  }
}

function validPreflight(value: unknown, requestId: string): value is RetroApprovalPreflight {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Partial<RetroApprovalPreflight>;
  return v.request_id === requestId && typeof v.evidence_fingerprint === "string" &&
    v.historical_coverage_verified === false &&
    v.duration_impact_verified === false &&
    v.alert_impact_verified === false &&
    v.approval_allowed === false &&
    v.application_allowed === false &&
    Array.isArray(v.reasons) && v.reasons.every(x => typeof x === "string");
}

export async function previewRetroApprovalPreflight(
  requestId: string,
): Promise<RetroApprovalPreflight> {
  const { data, error } = await supabase.rpc("dashboard_preview_calendar_retro_approval_preflight", {
    p_request_id: requestId,
  });
  if (error) throw new Error(error.message || "A verificação de aprovação falhou.");
  if (!validPreflight(data, requestId))
    throw new Error("O servidor não retornou um bloqueio de aprovação verificável.");
  return data;
}

/** Creates a REVIEW DOSSIER only. Does not approve or apply corrections. */
export async function prepareRetroApprovalDossier(input: {
  requestId: string;
  expectedPreview: RetroApprovalPreflight;
  reason: string;
}): Promise<RetroApprovalDossier> {
  if (!validPreflight(input.expectedPreview, input.requestId))
    throw new Error("É necessário consultar uma prévia gerencial atualizada.");
  const { data, error } = await supabase.rpc("dashboard_prepare_calendar_retro_approval", {
    p_request_id: input.requestId,
    p_expected_preview: input.expectedPreview,
    p_reason: input.reason.trim(),
  });
  if (error) throw new Error(error.message || "Falha ao encaminhar a solicitação.");
  if (!data || typeof data !== "object" || data.request_id !== input.requestId ||
      data.status !== "awaiting_server_verification")
    throw new Error("O encaminhamento não retornou confirmação verificável.");
  return data as RetroApprovalDossier;
}
