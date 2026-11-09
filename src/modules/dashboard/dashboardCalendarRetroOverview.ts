import type { RetroApprovalPreflight } from "./dashboardCalendarRetroApprovalRepository";
import type { RetroServerDayImpact, RetroServerStageImpactRow } from "./dashboardCalendarRetroServerImpactRepository";
import type { RetroFullStagePreview, RetroFullStageRow } from "./dashboardCalendarRetroFullStageRepository";

export type RetroOverviewStatus = "pending" | "alert_change" | "time_change" | "unchanged";
export type RetroOverviewStage = {
  id: string;
  scope: string;
  day: RetroServerStageImpactRow | null;
  full: RetroFullStageRow | null;
  issues: string[];
  status: RetroOverviewStatus;
};
export type RetroOverviewOrder = {
  id: string;
  status: RetroOverviewStatus;
  stages: RetroOverviewStage[];
};
export type RetroOverview = {
  complete: boolean;
  warnings: string[];
  affectedOrders: number;
  candidateAlertChanges: number;
  pendingOrders: number;
  unchangedOrders: number;
  orders: RetroOverviewOrder[];
};

const priority: Record<RetroOverviewStatus, number> = {
  pending: 0, alert_change: 1, time_change: 2, unchanged: 3,
};

export function buildRetroOverview(input: {
  requestId: string;
  preflight: RetroApprovalPreflight | null;
  day: RetroServerDayImpact | null;
  full: RetroFullStagePreview | null;
}): RetroOverview {
  const { requestId, preflight, day, full } = input;
  const warnings: string[] = [];
  if (!preflight) warnings.push("A verificação de permissões e evidências não foi concluída.");
  if (!day) warnings.push("A simulação diária não foi concluída.");
  if (!full) warnings.push("A simulação da permanência completa não foi concluída.");
  if (preflight && preflight.request_id !== requestId) warnings.push("Prévia gerencial de outra solicitação.");
  if (day && day.request_id !== requestId) warnings.push("Prévia diária de outra solicitação.");
  if (full && full.request_id !== requestId) warnings.push("Prévia integral de outra solicitação.");
  if (day && full && (day.candidate_intervals !== full.candidate_intervals ||
      day.candidate_orders !== full.candidate_orders))
    warnings.push("As consultas encontraram quantidades diferentes de OS ou etapas. Atualize a análise.");
  if (preflight && day && (preflight.stage_intervals !== day.candidate_intervals ||
      preflight.candidate_orders !== day.candidate_orders))
    warnings.push("O diagnóstico gerencial divergiu da consulta diária.");

  const stages = new Map<string, { orderId: string; day: RetroServerStageImpactRow | null; full: RetroFullStageRow | null }>();
  for (const row of day?.rows ?? []) stages.set(row.interval_id, { orderId: row.order_id, day: row, full: null });
  for (const row of full?.rows ?? []) {
    const existing = stages.get(row.interval_id);
    if (existing) existing.full = row;
    else stages.set(row.interval_id, { orderId: row.order_id, day: null, full: row });
  }
  const orders = new Map<string, RetroOverviewOrder>();
  for (const [id, entry] of stages) {
    const issues: string[] = [];
    if (!entry.day || !entry.full) issues.push("Etapa ausente em uma das prévias.");
    if (entry.day && entry.full &&
        (entry.day.order_id !== entry.full.order_id || entry.day.scope !== entry.full.scope))
      issues.push("OS ou setor divergem entre as prévias.");
    if (entry.day?.state === "insufficient") issues.push("Dia: " + entry.day.reason);
    if (entry.full?.state === "insufficient") issues.push("Permanência: " + entry.full.reason);
    const status: RetroOverviewStatus = issues.length ? "pending" :
      entry.full?.severity_status === "candidate" &&
        entry.full.severity_before !== entry.full.severity_proposed ? "alert_change" :
      entry.full?.useful_before !== entry.full?.useful_proposed ? "time_change" : "unchanged";
    const scope = entry.full?.scope ?? entry.day?.scope ?? "Indefinido";
    const stage: RetroOverviewStage = { id, scope, day: entry.day, full: entry.full, issues, status };
    const owner = orders.get(entry.orderId) ?? { id: entry.orderId, status: "unchanged" as const, stages: [] };
    owner.stages.push(stage);
    if (priority[status] < priority[owner.status]) owner.status = status;
    orders.set(entry.orderId, owner);
  }
  const items = Array.from(orders.values()).sort((a, b) =>
    priority[a.status] - priority[b.status] || a.id.localeCompare(b.id));
  if (day && full && day.rows.some(row => !full.rows.some(other => other.interval_id === row.interval_id)) ||
      day && full && full.rows.some(row => !day.rows.some(other => other.interval_id === row.interval_id)))
    warnings.push("As prévias não concordam sobre quais etapas atravessam a data.");

  return {
    complete: !!(preflight && day && full) && warnings.length === 0,
    warnings,
    affectedOrders: items.filter(item => item.status === "alert_change" || item.status === "time_change").length,
    candidateAlertChanges: items.reduce((count, order) => count + order.stages.filter(stage =>
      stage.status === "alert_change").length, 0),
    pendingOrders: items.filter(item => item.status === "pending").length,
    unchangedOrders: items.filter(item => item.status === "unchanged").length,
    orders: items,
  };
}
