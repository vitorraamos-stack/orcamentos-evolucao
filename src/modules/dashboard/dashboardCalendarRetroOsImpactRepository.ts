import { supabase } from "@/lib/supabase";
import { listDashboardAdvancedSources } from "./dashboardAdvancedRepository";
import type { CalendarRetroRequest } from "./dashboardCalendarRetroRepository";
import {
  simulateCalendarRetroOsImpact, type RetroOsImpactResult,
} from "./dashboardCalendarRetroOsImpact";

/**
 * Manager-only RPC discovers ALL candidate OS IDs for the historical day.
 * The server rejects more than 300 IDs instead of silently sampling them.
 * The client reads existing evidence and runs a pure, read-only simulation.
 */
export async function loadCalendarRetroOsImpact(
  request: CalendarRetroRequest,
): Promise<RetroOsImpactResult> {
  const { data, error } = await supabase.rpc("dashboard_list_calendar_retro_candidate_orders", {
    p_request_id: request.id,
  });
  if (error) throw new Error(error.message || "Falha ao descobrir OS candidatas.");
  if (!data || typeof data !== "object" || data.request_id !== request.id ||
      data.read_only !== true || !Array.isArray(data.order_ids) ||
      !Number.isSafeInteger(data.candidate_order_count) ||
      data.candidate_order_count < 0 || data.candidate_order_count > 300 ||
      data.candidate_order_count !== data.order_ids.length ||
      data.order_ids.some((id: unknown) => typeof id !== "string" || !id) ||
      new Set(data.order_ids).size !== data.order_ids.length ||
      typeof data.as_of !== "string" || !Number.isFinite(Date.parse(data.as_of))) {
    throw new Error("A lista de OS candidatas não está completa ou não é verificável.");
  }
  const ids = data.order_ids as string[];
  if (!ids.length) return {
    requestId: request.id, asOf: data.as_of, candidateOrders: 0, rows: [],
    verifiedIntervals: 0, insufficientIntervals: 0, changedIntervals: 0,
    verifiedAlertChanges: 0, allVerified: true, approvalAllowed: false,
  };
  const sources = await listDashboardAdvancedSources(ids);
  return simulateCalendarRetroOsImpact({
    request, candidateOrderIds: ids, asOf: data.as_of, sources,
  });
}
