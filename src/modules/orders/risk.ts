import { formatLocalDate } from "@/shared/lib/date";

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

const DAY_MS = 86_400_000;

/**
 * Whole workdays remaining in the Santa Catarina operational calendar.
 * Counts weekdays after today through the delivery date, excluding Sat/Sun.
 * A past date is -1; an absent or invalid date is null.
 */
export function businessDaysUntilDeadline(deliveryDate: string | null | undefined, now = new Date()): number | null {
  if (!deliveryDate || !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return null;
  const today = formatLocalDate(now);
  const start = new Date(`${today}T12:00:00Z`);
  const end = new Date(`${deliveryDate}T12:00:00Z`);
  if (!Number.isFinite(end.getTime())) return null;
  if (deliveryDate < today) return -1;
  const calendarDays = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  const fullWeeks = Math.floor(calendarDays / 7);
  let workdays = fullWeeks * 5;
  for (let offset = 1; offset <= calendarDays % 7; offset++) {
    const weekday = (start.getUTCDay() + offset) % 7;
    if (weekday >= 1 && weekday <= 5) workdays++;
  }
  return workdays;
}

/** Inactivity is independent of deadline proximity. */
export function isOrderStale(order: RiskOrder, now = new Date()): boolean {
  if (isOrderFinished(order) || !order.updated_at) return false;
  const lastUpdate = new Date(order.updated_at).getTime();
  return Number.isFinite(lastUpdate) && now.getTime() - lastUpdate >= 4 * DAY_MS;
}

export function calculateOrderRisk(
  order: RiskOrder,
  now = new Date()
): OrderRisk {
  if (isOrderFinished(order)) return "NORMAL";
  const businessDays = businessDaysUntilDeadline(order.delivery_date, now);

  // A due/overdue OS is critical regardless of production readiness.
  if (businessDays !== null && businessDays <= 1) return "CRITICO";
  if ((businessDays !== null && businessDays <= 3) || isOrderStale(order, now))
    return "ATENCAO";

  return "NORMAL";
}
