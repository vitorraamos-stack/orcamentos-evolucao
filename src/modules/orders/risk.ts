import {
  addLocalDays,
  formatLocalDate,
  startOfLocalDay,
} from "@/shared/lib/date";

export type OrderRisk = "NORMAL" | "ATENCAO" | "CRITICO";

export type RiskOrder = {
  delivery_date?: string | null;
  updated_at?: string | null;
  prod_status?: string | null;
  logistic_type?: string | null;
  archived?: boolean;
};

const normalize = (value?: string | null) =>
  (value ?? "").toLocaleLowerCase("pt-BR");

export const isOrderFinished = (order: RiskOrder) =>
  Boolean(order.archived) || normalize(order.prod_status).includes("finaliz");

export const isOrderOverdue = (order: RiskOrder, now = new Date()) =>
  !isOrderFinished(order) &&
  Boolean(order.delivery_date) &&
  order.delivery_date! < formatLocalDate(now);

export function calculateOrderRisk(
  order: RiskOrder,
  now = new Date()
): OrderRisk {
  if (isOrderFinished(order)) return "NORMAL";

  const today = startOfLocalDay(now);
  const deadline = order.delivery_date
    ? startOfLocalDay(new Date(`${order.delivery_date}T15:00:00Z`))
    : null;
  const daysToDeadline = deadline
    ? (Array.from({ length: 32 }, (_, days) => days).find(
        days =>
          formatLocalDate(addLocalDays(today, days)) === order.delivery_date
      ) ?? (isOrderOverdue(order, now) ? -1 : 32))
    : null;
  const productionReady = /pronto|logística|logistica|instalação agendada/.test(
    normalize(order.prod_status)
  );

  if (daysToDeadline !== null && daysToDeadline < 0) return "CRITICO";
  if (daysToDeadline === 0 && !productionReady) return "CRITICO";
  if (
    order.logistic_type === "instalacao" &&
    daysToDeadline !== null &&
    daysToDeadline <= 1 &&
    !productionReady
  ) {
    return "CRITICO";
  }

  const updatedAt = order.updated_at ? new Date(order.updated_at) : null;
  const idleDays = updatedAt
    ? Math.floor((now.getTime() - updatedAt.getTime()) / 86_400_000)
    : 0;
  if ((daysToDeadline !== null && daysToDeadline <= 2) || idleDays >= 4)
    return "ATENCAO";

  return "NORMAL";
}
