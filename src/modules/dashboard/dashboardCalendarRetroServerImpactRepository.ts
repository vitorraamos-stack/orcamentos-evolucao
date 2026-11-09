import { supabase } from "@/lib/supabase";

export type RetroServerStageImpactRow = {
  order_id: string;
  interval_id: string;
  scope: string;
  state: "verified" | "insufficient";
  reason: string;
  minutes_before: number | null;
  minutes_proposed: number | null;
  pause_minutes_before: number | null;
  pause_minutes_proposed: number | null;
  useful_minutes_before: number | null;
  useful_minutes_proposed: number | null;
};

export type RetroServerDayImpact = {
  request_id: string;
  exception_date: string;
  as_of: string;
  candidate_orders: number;
  candidate_intervals: number;
  verified_intervals: number;
  insufficient_intervals: number;
  changed_intervals: number;
  rows: RetroServerStageImpactRow[];
  scope: "calendar_base_single_day";
  historical_coverage_verified: false;
  alerts_verified: false;
  approval_allowed: false;
  application_allowed: false;
  observacao: string;
};

function validInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function validateRetroServerDayImpact(
  value: unknown, requestId: string,
): value is RetroServerDayImpact {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Partial<RetroServerDayImpact>;
  if (v.request_id !== requestId || v.scope !== "calendar_base_single_day" ||
      v.historical_coverage_verified !== false || v.alerts_verified !== false ||
      v.approval_allowed !== false || v.application_allowed !== false ||
      typeof v.exception_date !== "string" || typeof v.as_of !== "string" ||
      !Number.isFinite(Date.parse(v.as_of)) || typeof v.observacao !== "string" ||
      !validInteger(v.candidate_orders) || v.candidate_orders > 300 ||
      !validInteger(v.candidate_intervals) || v.candidate_intervals > 1200 ||
      !validInteger(v.verified_intervals) || !validInteger(v.insufficient_intervals) ||
      !validInteger(v.changed_intervals) || !Array.isArray(v.rows) ||
      v.rows.length !== v.candidate_intervals ||
      v.verified_intervals + v.insufficient_intervals !== v.candidate_intervals ||
      v.changed_intervals > v.verified_intervals) return false;
  const ids = new Set<string>();
  let verified = 0;
  let insufficient = 0;
  for (const row of v.rows) {
    if (!row || typeof row !== "object" || Array.isArray(row) ||
        typeof row.order_id !== "string" || !row.order_id ||
        typeof row.interval_id !== "string" || !row.interval_id ||
        typeof row.scope !== "string" || typeof row.reason !== "string" ||
        ids.has(row.interval_id) || !["verified","insufficient"].includes(row.state)) {
      return false;
    }
    ids.add(row.interval_id);
    if (row.state === "insufficient") {
      insufficient += 1;
      if (row.minutes_before !== null || row.minutes_proposed !== null ||
          row.pause_minutes_before !== null || row.pause_minutes_proposed !== null ||
          row.useful_minutes_before !== null || row.useful_minutes_proposed !== null)
        return false;
    } else {
      verified += 1;
      const numbers = [
        row.minutes_before, row.minutes_proposed,
        row.pause_minutes_before, row.pause_minutes_proposed,
        row.useful_minutes_before, row.useful_minutes_proposed,
      ];
      if (numbers.some(n => !validInteger(n)) ||
          row.useful_minutes_before !== row.minutes_before! - row.pause_minutes_before! ||
          row.useful_minutes_proposed !== row.minutes_proposed! - row.pause_minutes_proposed!)
        return false;
    }
  }
  return verified === v.verified_intervals && insufficient === v.insufficient_intervals;
}

/** Only manager RPC may compute this read-only advisory preview. */
export async function previewRetroServerDayImpact(requestId: string): Promise<RetroServerDayImpact> {
  const { data, error } = await supabase.rpc("dashboard_preview_calendar_retro_day_stage_impact", {
    p_request_id: requestId,
  });
  if (error) throw new Error(error.message || "Falha ao calcular a prévia no servidor.");
  if (!validateRetroServerDayImpact(data, requestId))
    throw new Error("A prévia por OS retornou dados inconsistentes. Nenhuma correção foi aplicada.");
  return data;
}
