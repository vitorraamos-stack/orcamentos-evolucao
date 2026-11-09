import { supabase } from "@/lib/supabase";

export type CalendarRetroPreview = {
  calendar_version_id: string;
  exception_date: string;
  existing_exception: {
    working: boolean; start: string | null; end: string | null; reason: string;
  } | null;
  stage_intervals_candidates: number;
  verified_stage_intervals_candidates: number;
  duration_impact_verified: false;
  observacao: string;
};

export type CalendarRetroRequest = {
  id: string;
  calendar_version_id: string;
  exception_date: string;
  proposed_working: boolean;
  proposed_start: string | null;
  proposed_end: string | null;
  reason: string;
  submitted_at: string;
  submitted_by: string;
  state: "pending_review";
};

export type CalendarRetroInput = {
  calendarVersionId: string;
  date: string;
  working: boolean;
  start: string | null;
  end: string | null;
  reason: string;
};

function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205" ||
    /dashboard_calendar_retro_review_requests.*(does not exist|not found)/i.test(error.message ?? "")));
}

/** Never misreport a missing table as an empty list of historical requests. */
export async function listCalendarRetroRequests(): Promise<
  { state: "available"; rows: CalendarRetroRequest[] } |
  { state: "unavailable"; rows: [] }
> {
  // Exhaust the history: a silent .limit(100) would hide older audit requests.
  // Count and page explicitly; never present a partial read as a complete history.
  const pageSize = 500;
  const rows: CalendarRetroRequest[] = [];
  let expectedCount: number | null = null;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error, count } = await supabase.from("dashboard_calendar_retro_review_requests")
      .select("id,calendar_version_id,exception_date,proposed_working,proposed_start,proposed_end,reason,submitted_at,submitted_by,state", { count: "exact" })
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (isMissingSchema(error)) return { state: "unavailable", rows: [] };
    if (error) throw new Error(error.message || "Não foi possível consultar solicitações históricas.");
    if (count == null || !Number.isSafeInteger(count) || count < 0)
      throw new Error("Contagem do histórico indisponível: não é seguro exibir um histórico parcial.");
    if (expectedCount === null) expectedCount = count;
    if (expectedCount !== count)
      throw new Error("O histórico mudou durante a leitura. Atualize para obter os registros completos.");
    const page = (data ?? []) as CalendarRetroRequest[];
    if (page.length !== Math.min(pageSize, expectedCount - offset))
      throw new Error("Histórico incompleto. Atualize para tentar novamente.");
    rows.push(...page);
    if (rows.length === expectedCount) break;
  }
  return { state: "available", rows };
}

export async function previewCalendarRetroRequest(input: {
  calendarVersionId: string; date: string;
}): Promise<CalendarRetroPreview> {
  const { data, error } = await supabase.rpc("dashboard_preview_calendar_retro_request", {
    p_calendar_version_id: input.calendarVersionId,
    p_date: input.date,
  });
  if (error) throw new Error(error.message || "Falha na prévia retroativa.");
  if (!data || typeof data !== "object")
    throw new Error("A prévia retroativa não retornou confirmação.");
  return data as CalendarRetroPreview;
}

/**
 * Submission does NOT change a calendar, OS, alert or historical duration.
 * A separate authorized approval/application flow will be required later.
 */
export async function requestCalendarRetroReview(
  input: CalendarRetroInput,
): Promise<CalendarRetroRequest> {
  const { data, error } = await supabase.rpc("dashboard_request_calendar_retro_review", {
    p_calendar_version_id: input.calendarVersionId,
    p_date: input.date,
    p_working: input.working,
    p_start: input.working ? input.start : null,
    p_end: input.working ? input.end : null,
    p_reason: input.reason,
  });
  if (error) throw new Error(error.message || "Não foi possível registrar a solicitação retroativa.");
  if (!data || typeof data !== "object")
    throw new Error("A solicitação não retornou registro verificável.");
  return data as CalendarRetroRequest;
}
