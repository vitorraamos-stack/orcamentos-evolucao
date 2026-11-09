import { supabase } from "@/lib/supabase";

export type CalendarRetroReviewPreview = {
  request_id: string;
  calendar_version_id: string;
  exception_date: string;
  base_minutes_before: number;
  base_minutes_proposed: number;
  base_minutes_delta: number;
  stage_intervals_candidates: number;
  verified_stage_intervals_candidates: number;
  unverified_stage_intervals: number;
  open_stage_intervals: number;
  sector_calendars_to_review: number;
  thresholds_to_review: number;
  already_rejected: boolean;
  duration_impact_verified: false;
  alert_impact_verified: false;
  approval_allowed: false;
  observacao: string;
};

export type CalendarRetroReviewEvent = {
  id: string;
  request_id: string;
  action: "needs_evidence" | "rejected";
  reason: string;
  preview: CalendarRetroReviewPreview;
  reviewed_by: string;
  reviewed_at: string;
};

function missingSchema(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" ||
    /dashboard_calendar_retro_review_events.*(does not exist|not found)/i.test(error.message ?? ""));
}

/** Do not disguise migration absence or a partial audit history as no decisions. */
export async function listCalendarRetroReviewEvents(): Promise<
  { state: "available"; rows: CalendarRetroReviewEvent[] } |
  { state: "unavailable"; rows: [] }
> {
  const pageSize = 500;
  let expectedCount: number | null = null;
  const rows: CalendarRetroReviewEvent[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error, count } = await supabase.from("dashboard_calendar_retro_review_events")
      .select("id,request_id,action,reason,preview,reviewed_by,reviewed_at", { count: "exact" })
      .order("reviewed_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (missingSchema(error)) return { state: "unavailable", rows: [] };
    if (error) throw new Error(error.message || "Falha ao consultar pareceres históricos.");
    if (count === null || !Number.isSafeInteger(count) || count < 0)
      throw new Error("Contagem de pareceres indisponível.");
    if (expectedCount === null) expectedCount = count;
    if (expectedCount !== count)
      throw new Error("O histórico de pareceres mudou durante a consulta. Atualize.");
    const page = (data ?? []) as CalendarRetroReviewEvent[];
    if (page.length !== Math.min(pageSize, expectedCount - offset))
      throw new Error("Consulta incompleta dos pareceres. Atualize.");
    rows.push(...page);
    if (rows.length === expectedCount) break;
  }
  return { state: "available", rows };
}

export async function previewCalendarRetroReview(requestId: string): Promise<CalendarRetroReviewPreview> {
  const { data, error } = await supabase.rpc("dashboard_preview_calendar_retro_review", {
    p_request_id: requestId,
  });
  if (error) throw new Error(error.message || "Não foi possível simular o calendário histórico.");
  if (!data || typeof data !== "object" || data.request_id !== requestId ||
      data.approval_allowed !== false || data.duration_impact_verified !== false)
    throw new Error("A simulação não retornou uma prévia segura e verificável.");
  return data as CalendarRetroReviewPreview;
}

/** Only evidence requests or rejection can be recorded. No approve/apply RPC exists. */
export async function recordCalendarRetroReview(input: {
  requestId: string;
  action: "needs_evidence" | "rejected";
  reason: string;
  expectedPreview: CalendarRetroReviewPreview;
}): Promise<CalendarRetroReviewEvent> {
  if (input.expectedPreview.request_id !== input.requestId ||
      input.expectedPreview.approval_allowed !== false)
    throw new Error("Prévia não corresponde à solicitação.");
  const { data, error } = await supabase.rpc("dashboard_record_calendar_retro_review", {
    p_request_id: input.requestId,
    p_action: input.action,
    p_reason: input.reason,
    p_expected_preview: input.expectedPreview,
  });
  if (error) throw new Error(error.message || "Falha ao registrar parecer gerencial.");
  if (!data || typeof data !== "object" || data.request_id !== input.requestId ||
      data.action !== input.action)
    throw new Error("O parecer não retornou confirmação verificável.");
  return data as CalendarRetroReviewEvent;
}
