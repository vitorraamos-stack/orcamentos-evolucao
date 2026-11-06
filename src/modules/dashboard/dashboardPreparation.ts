import type { DashboardOrder } from "./dashboardModel";
import type { AgendaEvent } from "./dashboardAgenda";

/** Existing order items and production operations, never stock reservations. */
export type PreparationItem = {
  id: string;
  order_id: string;
  name: string;
  status: "PENDING" | "IN_PROGRESS" | "READY" | "CANCELLED";
  updated_at: string;
};
export type PreparationOperation = {
  id: string;
  item_id: string;
  work_center: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED";
  is_required: boolean;
  assigned_to: string | null;
  blocked_reason: string | null;
  updated_at: string;
};
export type PreparationSources = { items: PreparationItem[]; operations: PreparationOperation[] };

export type ProductionReadiness = "ready" | "partial" | "pending" | "unverified";
export type MaterialReadiness = "pending" | "unverified";
export type CommitmentReadiness = "pending" | "partial" | "unverified";
export type OrderPreparation = {
  orderId: string;
  production: ProductionReadiness;
  materials: MaterialReadiness;
  combined: CommitmentReadiness;
  totalItems: number;
  readyItems: number;
  requiredOperations: number;
  completedOperations: number;
  blockedOperations: number;
  unassignedRequiredOperations: number;
  parallelCenters: number;
  reasons: string[];
};
export type CommitmentAssessment = {
  status: CommitmentReadiness;
  primaryAlert: string | null;
  additionalAlerts: string[];
  reasons: string[];
  nearCommitment: boolean;
};
export const DEFAULT_PREPARATION_LEAD_HOURS = 48;

export function assessOrderPreparation(
  order: DashboardOrder,
  items: readonly PreparationItem[],
  operations: readonly PreparationOperation[],
): OrderPreparation {
  const active = items.filter(item => item.order_id === order.id && item.status !== "CANCELLED");
  const itemIds = new Set(active.map(item => item.id));
  const relevant = operations.filter(operation => itemIds.has(operation.item_id));
  const required = relevant.filter(operation => operation.is_required);
  const blocked = required.filter(operation => operation.status === "BLOCKED");
  const requiredByItem = new Map<string, PreparationOperation[]>();
  for (const operation of required) {
    const list = requiredByItem.get(operation.item_id) ?? [];
    list.push(operation);
    requiredByItem.set(operation.item_id, list);
  }
  const readyItems = active.filter(item =>
    item.status === "READY" &&
    (requiredByItem.get(item.id) ?? []).every(operation => operation.status === "COMPLETED")
  ).length;
  const hasProgress = active.some(item => item.status === "IN_PROGRESS") ||
    relevant.some(operation => operation.status === "IN_PROGRESS" || operation.status === "COMPLETED");
  const production: ProductionReadiness =
    active.length === 0 ? "unverified" :
    blocked.length > 0 ? "pending" :
    readyItems === active.length ? "ready" :
    readyItems > 0 || hasProgress ? "partial" : "pending";

  // No existing order-to-stock-material reservation schema was found.
  // Even production_tag PRONTO, completed operations or an insumos resolution
  // cannot certify that the actual materials of THIS commitment are available.
  const materials: MaterialReadiness =
    order.production_tag === "AGUARDANDO_INSUMOS" ? "pending" : "unverified";
  const combined: CommitmentReadiness =
    materials === "pending" || production === "pending" ? "pending" :
    production === "partial" ? "partial" : "unverified";

  const reasons: string[] = [];
  if (materials === "pending") reasons.push("Aguardando insumos registrado na OS");
  else reasons.push("Materiais deste compromisso sem confirmação vinculada");
  if (production === "unverified") reasons.push("Itens de produção não cadastrados ou indisponíveis");
  if (production === "pending" && active.length) reasons.push("Produção ainda pendente");
  if (production === "partial") reasons.push("Produção parcialmente concluída");
  if (production === "ready") reasons.push("Itens de produção prontos; materiais ainda não verificados");
  if (blocked.length) reasons.push(String(blocked.length) + " operação(ões) obrigatória(s) bloqueada(s)");
  const unassigned = required.filter(operation =>
    operation.status !== "COMPLETED" && !operation.assigned_to
  ).length;
  if (unassigned) reasons.push(String(unassigned) + " operação(ões) obrigatória(s) sem responsável");
  const parallelCenters = new Set(relevant.filter(operation =>
    operation.status === "IN_PROGRESS" || operation.status === "BLOCKED"
  ).map(operation => operation.work_center)).size;
  if (parallelCenters > 1) reasons.push(String(parallelCenters) + " centros de trabalho ativos ou bloqueados");

  return {
    orderId: order.id, production, materials, combined,
    totalItems: active.length, readyItems,
    requiredOperations: required.length,
    completedOperations: required.filter(operation => operation.status === "COMPLETED").length,
    blockedOperations: blocked.length,
    unassignedRequiredOperations: unassigned,
    parallelCenters, reasons,
  };
}

export function buildOrderPreparations(
  orders: readonly DashboardOrder[], sources: PreparationSources
): Record<string, OrderPreparation> {
  const itemsByOrder = new Map<string, PreparationItem[]>();
  for (const item of sources.items) {
    const current = itemsByOrder.get(item.order_id) ?? [];
    current.push(item);
    itemsByOrder.set(item.order_id, current);
  }
  const opsByItem = new Map<string, PreparationOperation[]>();
  for (const operation of sources.operations) {
    const current = opsByItem.get(operation.item_id) ?? [];
    current.push(operation);
    opsByItem.set(operation.item_id, current);
  }
  const output: Record<string, OrderPreparation> = {};
  for (const order of orders) {
    const items = itemsByOrder.get(order.id) ?? [];
    const operations = items.flatMap(item => opsByItem.get(item.id) ?? []);
    output[order.id] = assessOrderPreparation(order, items, operations);
  }
  return output;
}

export function assessCommitment(
  event: AgendaEvent, order: OrderPreparation, now: Date,
  leadHours = DEFAULT_PREPARATION_LEAD_HOURS
): CommitmentAssessment {
  const validLead = Number.isFinite(leadHours) && leadHours >= 0 ? leadHours : DEFAULT_PREPARATION_LEAD_HOURS;
  const eventMillis = event.hasTime ? Date.parse(event.when) : Date.parse(event.dateKey + "T23:59:59-03:00");
  const near = Number.isFinite(eventMillis) && eventMillis - now.getTime() <= validLead * 3600_000;
  const alerts: string[] = [];
  if (order.materials === "pending") alerts.push("Materiais aguardando insumos");
  if (order.blockedOperations) alerts.push("Produção com operação obrigatória bloqueada");
  if (event.overdueWithoutCompletion) alerts.push("Horário previsto ultrapassado sem conclusão registrada");
  if (near && order.production !== "ready")
    alerts.push(order.production === "unverified" ? "Produção não verificada para compromisso próximo" :
      "Produção incompleta para compromisso próximo");
  if (event.conflict) alerts.push("Conflito de agenda registrado");
  if (event.warnings.some(w => /responsável não informado|equipe ou responsável não informado/i.test(w)))
    alerts.push("Responsável ou equipe não definido");
  if (order.unassignedRequiredOperations) alerts.push("Operações obrigatórias sem responsável");
  if (near && order.materials === "unverified")
    alerts.push("Materiais não verificados para compromisso próximo");
  // One primary alert. Detail preserves all other alerts and recorded conditions.
  return {
    status: order.combined,
    primaryAlert: alerts[0] ?? null,
    additionalAlerts: alerts.slice(1),
    reasons: order.reasons,
    nearCommitment: near,
  };
}

export function summarizePreparation(
  events: readonly AgendaEvent[], prepared: Record<string, OrderPreparation>
) {
  const keys = new Set(events.map(event => event.order.id));
  const available = Array.from(keys).map(id => prepared[id]).filter(
    (row): row is OrderPreparation => Boolean(row)
  );
  return {
    orders: available.length,
    pending: available.filter(row => row.combined === "pending").length,
    partial: available.filter(row => row.combined === "partial").length,
    unverified: available.filter(row => row.combined === "unverified").length,
    blocked: available.filter(row => row.blockedOperations > 0).length,
  };
}
