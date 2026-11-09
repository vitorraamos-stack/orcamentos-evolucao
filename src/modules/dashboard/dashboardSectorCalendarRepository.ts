import { supabase } from "@/lib/supabase";
import type { SectorCalendarDraft, SectorCalendarRevision } from "./dashboardSectorCalendar";

export type SectorCalendarRead =
  | { state: "available"; revisions: SectorCalendarRevision[] }
  | { state: "unavailable"; revisions: [] };

function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (
    error.code === "42P01" || error.code === "PGRST205" ||
    /dashboard_sector_calendar_revisions.*(does not exist|not found)/i.test(error.message ?? "")
  ));
}

/**
 * Never assume an unreadable or truncated history is a valid empty calendar.
 * Exact-count pagination protects the "latest effective revision" selection.
 */
export async function loadSectorCalendarRevisions(): Promise<SectorCalendarRead> {
  const revisions: SectorCalendarRevision[] = [];
  let expected: number | null = null;
  for (let from = 0; from <= 20000; from += 500) {
    const { data, count, error } = await supabase.from("dashboard_sector_calendar_revisions")
      .select(
        "id,scope,base_calendar_version_id,revision,effective_from,effective_until,mode,periods,exceptions,published_at,published_by,reason",
        { count: "exact" },
      )
      .order("effective_from", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + 499);
    if (isMissingSchema(error)) return { state: "unavailable", revisions: [] };
    if (error) throw new Error(error.message || "Falha ao consultar calendários setoriais.");
    if (count === null) throw new Error("Contagem de calendários setoriais indisponível.");
    if (expected === null) expected = count;
    if (expected !== count) throw new Error("Calendários alterados durante a consulta: atualize a lista.");
    const batch = (data ?? []) as SectorCalendarRevision[];
    if (batch.length !== Math.min(500, Math.max(0, count - from)))
      throw new Error("A consulta dos calendários setoriais retornou dados incompletos.");
    revisions.push(...batch);
    if (revisions.length === expected) return { state: "available", revisions };
  }
  throw new Error("Histórico de calendários setoriais excede o limite seguro de consulta.");
}

export async function publishSectorCalendar(input: SectorCalendarDraft & {
  expectedRevision: number;
  reason: string;
}): Promise<SectorCalendarRevision> {
  const { data, error } = await supabase.rpc("dashboard_publish_sector_calendar", {
    p_scope: input.scope,
    p_base_calendar_version_id: input.baseCalendarVersionId,
    p_effective_from: input.effectiveFrom,
    p_effective_until: input.effectiveUntil,
    p_mode: input.mode,
    p_periods: input.periods,
    p_exceptions: input.exceptions,
    p_expected_revision: input.expectedRevision,
    p_reason: input.reason,
  });
  if (error) throw new Error(error.message || "Não foi possível publicar o calendário setorial.");
  if (!data || typeof data !== "object")
    throw new Error("A publicação não retornou confirmação verificável.");
  return data as SectorCalendarRevision;
}
