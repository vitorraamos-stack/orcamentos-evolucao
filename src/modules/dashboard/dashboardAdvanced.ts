import type { DashboardOrder } from "./dashboardModel";
import type { PreparationItem, PreparationOperation } from "./dashboardPreparation";

/**
 * Dashboard stage 4: evidence-first read-only analysis. The current database
 * has activities, assignments and deadlines, but no recorded dependencies or
 * persisted operational policy. Unavailable != empty / optional / zero.
 */
export type OperationalScope = "ART" | "APPROVAL" | "PRODUCTION" | "FINISHING" | "INSTALLATION" | "LOGISTICS";
export type Requirement = "required" | "optional" | "conditional";
export type RuleSpec = {
  scope: OperationalScope;
  owner: Requirement;
  deadline: Requirement;
  conditionLogisticType: "instalacao" | "entrega" | null;
  stalledLimitMinutes: number | null;
  calendarVerified: boolean;
};
export type RuleSource = { state: "unavailable" } | { state: "configured"; rules: RuleSpec[] };
export type RelationSource =
  | { state: "unavailable" }
  | { state: "available"; links: OperationDependency[] };
export type OperationDependency = {
  id: string;
  order_id: string;
  predecessor_operation_id: string;
  successor_operation_id: string;
};
export type StageAssignee = { id: string; order_id: string; user_id: string; scope: string };
export type StageDeadline = { id: string; order_id: string; scope: string; due_date: string; completed_at: string | null };
export type OperationAudit = {
  id: string; os_id: string; type: string; created_at: string;
  payload: Record<string, unknown> | null;
};
export type AdvancedSources = {
  items: PreparationItem[];
  operations: PreparationOperation[];
  assignees: StageAssignee[];
  deadlines: StageDeadline[];
  rules: RuleSource;
  dependencies: RelationSource;
  events: OperationAudit[];
};

export type DependencyRow = {
  operationId: string;
  workCenter: string;
  status: PreparationOperation["status"];
  predecessorIds: string[];
  waitingOn: string[];
  blockingPredecessors: string[];
};
export type DependencyAssessment = {
  state: "unavailable" | "available" | "insufficient";
  rows: DependencyRow[];
  independentIds: string[];
  linkCount: number;
  waitingCount: number;
  confirmedBlocks: number;
  problems: string[];
};

export type AdvancedOrderAssessment = {
  order: DashboardOrder;
  scope: OperationalScope;
  blocked: PreparationOperation[];
  confirmedBlockCount: number;
  dependency: DependencyAssessment;
  requirementWarnings: string[];
  ruleStatus: "unavailable" | "configured";
  timing: "unavailable" | "insufficient";
  timingReason: string;
};

export function orderOperationalScope(order: DashboardOrder): OperationalScope {
  if (order.prod_status === "Instalação Agendada") return "INSTALLATION";
  if (order.prod_status === "Logística (Entrega/Transportadora)") return "LOGISTICS";
  if (order.prod_status === "Em Acabamento") return "FINISHING";
  if (order.prod_status === "Produção" || order.prod_status === "Pronto / Avisar Cliente") return "PRODUCTION";
  if (order.art_status === "Para Aprovação") return "APPROVAL";
  return "ART";
}

function policyRequired(rule: RuleSpec, kind: "owner" | "deadline", order: DashboardOrder) {
  const value = rule[kind];
  if (value === "required") return true;
  if (value === "optional") return false;
  // A conditional rule without a known predicate cannot be evaluated.
  return value === "conditional" && rule.conditionLogisticType != null &&
    rule.conditionLogisticType === order.logistic_type;
}

/** A missing owner/deadline is not a violation until an applicable rule exists. */
export function assessStageRequirements(
  order: DashboardOrder,
  ruleSource: RuleSource,
  assignees: readonly StageAssignee[],
  deadlines: readonly StageDeadline[],
): string[] {
  if (ruleSource.state !== "configured") return [];
  const scope = orderOperationalScope(order);
  const rule = ruleSource.rules.find(entry => entry.scope === scope);
  if (!rule) return [];
  const activeAssignees = assignees.filter(entry => entry.order_id === order.id);
  const activeDeadlines = deadlines.filter(entry => entry.order_id === order.id);
  // Logistics may be delivered by own team or carrier; no false mapping to INSTALLATION.
  const requiredAssignee = policyRequired(rule, "owner", order);
  const requiredDeadline = policyRequired(rule, "deadline", order);
  const hasScopeAssignee = activeAssignees.some(entry =>
    (entry.scope === scope || entry.scope === "GENERAL") && !!entry.user_id);
  const hasScopeDeadline = activeDeadlines.some(entry =>
    entry.scope === scope && /^\d{4}-\d{2}-\d{2}$/.test(entry.due_date));
  const messages: string[] = [];
  if (requiredAssignee && !hasScopeAssignee)
    messages.push("Responsável obrigatório não registrado para a etapa " + scope);
  if (requiredDeadline && !hasScopeDeadline)
    messages.push("Prazo obrigatório não registrado para a etapa " + scope);
  return messages;
}

function isValidOperationId(value: string, valid: Set<string>) { return valid.has(value); }

/**
 * Only persisted links between operations of the SAME order qualify.
 * A successor can have multiple predecessors; unrelated activities remain parallel.
 * No artificial sequential link from sort_order, work_center or timestamps.
 */
export function analyzeDependencies(
  orderId: string,
  items: readonly PreparationItem[],
  operations: readonly PreparationOperation[],
  source: RelationSource,
): DependencyAssessment {
  if (source.state === "unavailable") return {
    state: "unavailable", rows: [], independentIds: [],
    linkCount: 0, waitingCount: 0, confirmedBlocks: 0,
    problems: ["A estrutura de dependências ainda não está disponível. Vínculos não podem ser confirmados."],
  };
  const itemIds = new Set(items.filter(item => item.order_id === orderId && item.status !== "CANCELLED").map(item => item.id));
  const eligible = operations.filter(op => itemIds.has(op.item_id));
  const operationMap = new Map(eligible.map(op => [op.id, op]));
  const valid = new Set(operationMap.keys());
  const incoming = new Map<string, string[]>();
  const problems: string[] = [];
  const seen = new Set<string>();
  const outgoing = new Map<string, string[]>();

  for (const link of source.links.filter(link => link.order_id === orderId)) {
    const predecessor = link.predecessor_operation_id;
    const successor = link.successor_operation_id;
    if (!isValidOperationId(predecessor, valid) || !isValidOperationId(successor, valid) ||
        predecessor === successor) {
      problems.push("Vínculo com atividades ausentes, canceladas ou iguais: " + link.id);
      continue;
    }
    const key = predecessor + ":" + successor;
    if (seen.has(key)) continue;
    seen.add(key);
    incoming.set(successor, [...(incoming.get(successor) ?? []), predecessor]);
    outgoing.set(predecessor, [...(outgoing.get(predecessor) ?? []), successor]);
  }
  const visited = new Set<string>();
  const visiting = new Set<string>();
  let cyclic = false;
  function visit(id: string) {
    if (visiting.has(id)) { cyclic = true; return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of outgoing.get(id) ?? []) visit(next);
    visiting.delete(id);
    visited.add(id);
  }
  for (const op of eligible) visit(op.id);
  if (cyclic) problems.push("Os vínculos apresentam ciclo; a sequência não pode ser confirmada.");

  const rows: DependencyRow[] = eligible.map(op => {
    const predecessors = incoming.get(op.id) ?? [];
    const waitingOn = op.status === "COMPLETED" || cyclic ? [] :
      predecessors.filter(id => operationMap.get(id)?.status !== "COMPLETED");
    const blockingPredecessors = waitingOn.filter(id => operationMap.get(id)?.status === "BLOCKED");
    return {
      operationId: op.id, workCenter: op.work_center, status: op.status,
      predecessorIds: predecessors, waitingOn, blockingPredecessors,
    };
  });

  return {
    state: problems.length ? "insufficient" : "available",
    rows, independentIds: eligible.filter(op => !incoming.has(op.id) && !outgoing.has(op.id)).map(op => op.id),
    linkCount: seen.size,
    waitingCount: cyclic ? 0 : rows.filter(row => row.waitingOn.length > 0).length,
    confirmedBlocks: cyclic ? 0 : rows.filter(row => row.blockingPredecessors.length > 0).length,
    problems,
  };
}

/**
 * Blocked is a confirmed status; long-stalled/gargalo is NOT inferred.
 * Time computation remains explicitly unavailable until a versioned calendar,
 * complete stage entry history and verified pauses exist.
 */
export function buildAdvancedAssessments(
  orders: readonly DashboardOrder[], sources: AdvancedSources
): AdvancedOrderAssessment[] {
  const itemsByOrder = new Map<string, PreparationItem[]>();
  for (const item of sources.items) itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) ?? []), item]);
  const operationsByItem = new Map<string, PreparationOperation[]>();
  for (const op of sources.operations) operationsByItem.set(op.item_id, [...(operationsByItem.get(op.item_id) ?? []), op]);
  return orders.map(order => {
    const items = itemsByOrder.get(order.id) ?? [];
    const activeIds = new Set(items.filter(item => item.status !== "CANCELLED").map(item => item.id));
    const operations = items.flatMap(item => operationsByItem.get(item.id) ?? []);
    const blocked = operations.filter(op => activeIds.has(op.item_id) && op.status === "BLOCKED");
    const dependency = analyzeDependencies(order.id, items, operations, sources.dependencies);
    const rules = sources.rules;
    const configuredScopeRule = rules.state === "configured" && rules.rules.some(r => r.scope === orderOperationalScope(order));
    return {
      order, scope: orderOperationalScope(order), blocked,
      confirmedBlockCount: blocked.length, dependency,
      requirementWarnings: assessStageRequirements(order, rules, sources.assignees, sources.deadlines),
      ruleStatus: configuredScopeRule ? "configured" : "unavailable",
      timing: "unavailable",
      timingReason: "Tempo parado/gargalo não mensurável: faltam calendário, pausas ou histórico integral comprovados.",
    };
  });
}

export function advancedSummary(rows: readonly AdvancedOrderAssessment[]) {
  return {
    orders: rows.length,
    withConfirmedBlocks: rows.filter(row => row.confirmedBlockCount > 0).length,
    withMissingRequirements: rows.filter(row => row.requirementWarnings.length > 0).length,
    waitingSuccessors: rows.reduce((acc, row) => acc + (row.dependency.state === "available" ? row.dependency.waitingCount : 0), 0),
    rulesAvailable: rows.some(row => row.ruleStatus === "configured"),
    linksAvailable: rows.some(row => row.dependency.state !== "unavailable"),
  };
}
