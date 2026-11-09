import { supabase } from "@/lib/supabase";

export type RetroFullStageAlert = "normal" | "attention" | "critical";
export type RetroFullStageRow = {
  order_id: string;
  interval_id: string;
  scope: string;
  state: "verified" | "insufficient";
  reason: string;
  gross_before: number | null;
  gross_proposed: number | null;
  pause_before: number | null;
  pause_proposed: number | null;
  useful_before: number | null;
  useful_proposed: number | null;
  severity_before: RetroFullStageAlert | null;
  severity_proposed: RetroFullStageAlert | null;
  severity_status: "candidate" | "historical_review" | "threshold_unverified" | "unavailable";
};

export type RetroFullStagePreview = {
  request_id: string;
  as_of: string;
  candidate_orders: number;
  candidate_intervals: number;
  verified_intervals: number;
  insufficient_intervals: number;
  candidate_alert_changes: number;
  rows: RetroFullStageRow[];
  scope: "full_stage_consultative";
  historical_coverage_verified: false;
  alerts_verified: false;
  approval_allowed: false;
  application_allowed: false;
  observacao: string;
};

function isMinutes(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSeverity(value: unknown): value is RetroFullStageAlert {
  return value === "normal" || value === "attention" || value === "critical";
}

/** Fail closed on incomplete lists, mismatched counts or any approval flags. */
export function validateRetroFullStagePreview(
  value: unknown, requestId: string,
): value is RetroFullStagePreview {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const p = value as Partial<RetroFullStagePreview>;
  if (p.request_id !== requestId || p.scope !== "full_stage_consultative" ||
      p.historical_coverage_verified !== false || p.alerts_verified !== false ||
      p.approval_allowed !== false || p.application_allowed !== false ||
      typeof p.as_of !== "string" || !Number.isFinite(Date.parse(p.as_of)) ||
      typeof p.observacao !== "string" ||
      !isMinutes(p.candidate_orders) || p.candidate_orders > 300 ||
      !isMinutes(p.candidate_intervals) || p.candidate_intervals > 1200 ||
      !isMinutes(p.verified_intervals) || !isMinutes(p.insufficient_intervals) ||
      !isMinutes(p.candidate_alert_changes) || !Array.isArray(p.rows) ||
      p.rows.length !== p.candidate_intervals ||
      p.verified_intervals + p.insufficient_intervals !== p.candidate_intervals)
    return false;

  const intervalIds = new Set<string>();
  const orderIds = new Set<string>();
  let verified = 0;
  let insufficient = 0;
  let changes = 0;
  for (const row of p.rows) {
    if (!row || typeof row !== "object" || Array.isArray(row) ||
        typeof row.order_id !== "string" || !row.order_id ||
        typeof row.interval_id !== "string" || !row.interval_id ||
        intervalIds.has(row.interval_id) ||
        typeof row.scope !== "string" || !row.scope ||
        typeof row.reason !== "string" || !row.reason ||
        !["verified", "insufficient"].includes(row.state) ||
        !["candidate", "historical_review", "threshold_unverified", "unavailable"]
          .includes(row.severity_status)) return false;
    intervalIds.add(row.interval_id);
    orderIds.add(row.order_id);
    if (row.state === "insufficient") {
      insufficient += 1;
      if (row.severity_status !== "unavailable" ||
          [row.gross_before, row.gross_proposed, row.pause_before, row.pause_proposed,
            row.useful_before, row.useful_proposed, row.severity_before,
            row.severity_proposed].some(x => x !== null)) return false;
      continue;
    }
    verified += 1;
    if (![row.gross_before, row.gross_proposed, row.pause_before, row.pause_proposed,
        row.useful_before, row.useful_proposed].every(isMinutes) ||
        row.pause_before! > row.gross_before! ||
        row.pause_proposed! > row.gross_proposed! ||
        row.useful_before !== row.gross_before! - row.pause_before! ||
        row.useful_proposed !== row.gross_proposed! - row.pause_proposed!)
      return false;
    if (row.severity_status === "candidate") {
      if (!isSeverity(row.severity_before) || !isSeverity(row.severity_proposed))
        return false;
      if (row.severity_before !== row.severity_proposed) changes += 1;
    } else if (row.severity_before !== null || row.severity_proposed !== null) {
      return false;
    }
  }
  return verified === p.verified_intervals &&
    insufficient === p.insufficient_intervals &&
    orderIds.size === p.candidate_orders && changes === p.candidate_alert_changes;
}

/** Server-side advisory, not an authorized amendment to OS or alerts. */
export async function previewRetroFullStageAlerts(
  requestId: string,
): Promise<RetroFullStagePreview> {
  const { data, error } = await supabase.rpc("dashboard_preview_calendar_retro_full_stage_alerts", {
    p_request_id: requestId,
  });
  if (error) throw new Error(error.message || "Falha no recálculo integral das etapas.");
  if (!validateRetroFullStagePreview(data, requestId))
    throw new Error("Resultado integral inconsistente. Nenhuma OS ou alerta foi alterado.");
  return data;
}
