import type { OsOrder } from "@/features/hubos/types";
import type { ItemOperation } from "@/modules/production/operations";

export type QueueKind = "ART" | "PRODUCTION" | "FINISHING" | "OPERATION" | "INSTALLATION";
export type QueueStatus = "TODO" | "IN_PROGRESS" | "WAITING" | "BLOCKED" | "DONE";
export type QueueAction = "START_ART" | "SEND_APPROVAL" | "RETAKE_ART" | "RELEASE_LAYOUT" |
  "START_OPERATION" | "FINISH_OPERATION" | "OPEN_PRODUCTION" | "OPEN_INSTALLATION" | "OPEN_OS";

export type MyQueueRow = {
  id: string;
  orderId: string;
  order: OsOrder;
  kind: QueueKind;
  sector: string;
  activity: string;
  itemLabel: string | null;
  status: QueueStatus;
  dueDate: string | null;
  dueKind: "stage" | "order" | "schedule";
  urgent: boolean;
  action: QueueAction;
  updatedAt: string;
  operation?: ItemOperation;
  installationId?: string;
};

export type QueueView = "action" | "waiting" | "done";
export type QueuePeriod = "all" | "overdue" | "today" | "soon";

export function localDateKey(date: Date): string {
  // Calendário da operação no fuso brasileiro, inclusive em dispositivos fora dele.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find(value => value.type === type)?.value ?? "00";
  return part("year") + "-" + part("month") + "-" + part("day");
}

export function addBusinessDays(dateKey: string, days: number): string {
  const date = new Date(dateKey + "T12:00:00Z");
  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) remaining--;
  }
  return date.toISOString().slice(0, 10);
}

export function isActionable(row: MyQueueRow) {
  return row.status === "TODO" || row.status === "IN_PROGRESS" || row.status === "BLOCKED";
}

export function isStageOverdue(row: MyQueueRow, today: string) {
  return isActionable(row) && row.dueKind !== "order" && Boolean(row.dueDate && row.dueDate < today);
}

export function isOrderDeadlineRisk(row: MyQueueRow, today: string) {
  return isActionable(row) && row.dueKind === "order" && Boolean(row.dueDate && row.dueDate < today);
}

export function isStageSoon(row: MyQueueRow, today: string) {
  return isActionable(row) && row.dueKind !== "order" && Boolean(
    row.dueDate && row.dueDate >= today && row.dueDate <= addBusinessDays(today, 3)
  );
}

export function queueMetrics(rows: MyQueueRow[], today: string) {
  return {
    pending: rows.filter(isActionable).length,
    overdue: rows.filter(row => isStageOverdue(row, today)).length,
    soon: rows.filter(row => isStageSoon(row, today)).length,
    waiting: rows.filter(row => row.status === "WAITING").length,
    orderRisk: rows.filter(row => isOrderDeadlineRisk(row, today)).length,
  };
}

export function sortQueueRows(rows: MyQueueRow[], today: string) {
  const score = (row: MyQueueRow) => {
    if (isStageOverdue(row, today)) return 0;
    if (isStageSoon(row, today)) return 1;
    if (isOrderDeadlineRisk(row, today)) return 2;
    if (row.urgent) return 3;
    if (row.status === "BLOCKED") return 4;
    return 5;
  };
  return [...rows].sort((a, b) =>
    score(a) - score(b) ||
    (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") ||
    a.order.sale_number.localeCompare(b.order.sale_number) ||
    a.activity.localeCompare(b.activity, "pt-BR")
  );
}

export function filterQueueRows(rows: MyQueueRow[], input: {
  view: QueueView;
  search: string;
  sector: string;
  period: QueuePeriod;
  today: string;
}) {
  const term = input.search.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const match = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(term);
  return sortQueueRows(rows.filter(row => {
    const onView = input.view === "action" ? isActionable(row) :
      input.view === "waiting" ? row.status === "WAITING" : row.status === "DONE";
    if (!onView || (input.sector !== "all" && row.sector !== input.sector)) return false;
    if (term && !match([row.order.sale_number, row.order.os_number ?? "", row.order.client_name,
      row.order.title ?? "", row.itemLabel ?? "", row.activity, row.sector].join(" "))) return false;
    switch (input.period) {
      case "overdue": return isStageOverdue(row, input.today) || isOrderDeadlineRisk(row, input.today);
      case "today": return row.dueDate === input.today;
      case "soon": return Boolean(row.dueDate && row.dueDate >= input.today && row.dueDate <= addBusinessDays(input.today, 3));
      default: return true;
    }
  }), input.today);
}
