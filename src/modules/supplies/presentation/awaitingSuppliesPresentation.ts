import type { OsOrder } from "@/features/hubos/types";
import { calculateOrderRisk } from "@/modules/orders/risk";

export type SuppliesFilter = "all" | "critical" | "urgent" | "overdue";
export type SuppliesSortMode = "priority" | "oldest" | "newest" | "deadline";

const DAY = 86_400_000;
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const calendarDate = (value?: string | null) =>
  value ? new Date(`${value.slice(0, 10)}T00:00:00`) : null;
const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());
const dayDifference = (value: string, now: Date) =>
  Math.round(
    (calendarDate(value)!.getTime() - startOfDay(now).getTime()) / DAY
  );
const timestamp = (value?: string | null) => {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(parsed) ? null : parsed;
};

export const isAwaitingSupplyUrgent = (order: OsOrder) =>
  order.is_urgent === true || order.art_direction_tag === "URGENTE";

export const isAwaitingSupplyOverdue = (order: OsOrder, now = new Date()) =>
  Boolean(
    order.delivery_date && order.delivery_date.slice(0, 10) < dateKey(now)
  );

export const isAwaitingSupplyDueToday = (order: OsOrder, now = new Date()) =>
  order.delivery_date?.slice(0, 10) === dateKey(now);

export const getWaitingDays = (order: OsOrder, now = new Date()) => {
  if (!order.insumos_requested_at) return null;
  const requestedAt = startOfDay(new Date(order.insumos_requested_at));
  if (Number.isNaN(requestedAt.getTime())) return null;
  return Math.max(
    0,
    Math.floor((startOfDay(now).getTime() - requestedAt.getTime()) / DAY)
  );
};

export const formatWaitingLabel = (order: OsOrder, now = new Date()) => {
  const days = getWaitingDays(order, now);
  if (days === null) return "Solicitação sem data";
  if (days === 0) return "Aguardando desde hoje";
  return `Aguardando há ${days} ${days === 1 ? "dia" : "dias"}`;
};

export const formatSupplyDeadlineStatus = (
  order: OsOrder,
  now = new Date()
) => {
  if (!order.delivery_date) return "Sem prazo";
  const difference = dayDifference(order.delivery_date, now);
  if (difference < 0) {
    const days = Math.abs(difference);
    return `Prazo vencido há ${days} ${days === 1 ? "dia" : "dias"}`;
  }
  if (difference === 0) return "Prazo hoje";
  if (difference === 1) return "Prazo amanhã";
  return `Prazo em ${difference} dias`;
};

export const summarizeAwaitingSupplies = (
  orders: readonly OsOrder[],
  now = new Date()
) => ({
  total: orders.length,
  critical: orders.filter(order => calculateOrderRisk(order, now) === "CRITICO")
    .length,
  urgent: orders.filter(isAwaitingSupplyUrgent).length,
  overdue: orders.filter(order => isAwaitingSupplyOverdue(order, now)).length,
});

export const filterAwaitingSupplies = (
  orders: readonly OsOrder[],
  filter: SuppliesFilter,
  now = new Date()
) =>
  orders.filter(order => {
    if (filter === "critical")
      return calculateOrderRisk(order, now) === "CRITICO";
    if (filter === "urgent") return isAwaitingSupplyUrgent(order);
    if (filter === "overdue") return isAwaitingSupplyOverdue(order, now);
    return true;
  });

export const getSupplyPriority = (order: OsOrder, now = new Date()) =>
  [
    calculateOrderRisk(order, now) === "CRITICO" ? 0 : 1,
    isAwaitingSupplyUrgent(order) ? 0 : 1,
    isAwaitingSupplyOverdue(order, now) ? 0 : 1,
    isAwaitingSupplyDueToday(order, now) ? 0 : 1,
    order.delivery_date?.slice(0, 10) ?? "9999-12-31",
    -(getWaitingDays(order, now) ?? -1),
  ] as const;

const comparePriority = (left: OsOrder, right: OsOrder, now: Date) => {
  const a = getSupplyPriority(left, now);
  const b = getSupplyPriority(right, now);
  for (let index = 0; index < a.length; index += 1) {
    const comparison =
      typeof a[index] === "number"
        ? Number(a[index]) - Number(b[index])
        : String(a[index]).localeCompare(String(b[index]));
    if (comparison !== 0) return comparison;
  }
  return left.id.localeCompare(right.id);
};

export const sortAwaitingSupplies = (
  orders: readonly OsOrder[],
  mode: SuppliesSortMode,
  now = new Date()
) =>
  [...orders].sort((left, right) => {
    const leftRequested = timestamp(left.insumos_requested_at);
    const rightRequested = timestamp(right.insumos_requested_at);
    let comparison = 0;
    if (mode === "priority") comparison = comparePriority(left, right, now);
    if (mode === "oldest")
      comparison = (leftRequested ?? Infinity) - (rightRequested ?? Infinity);
    if (mode === "newest")
      comparison = (rightRequested ?? -Infinity) - (leftRequested ?? -Infinity);
    if (mode === "deadline") {
      comparison = (left.delivery_date ?? "9999-12-31").localeCompare(
        right.delivery_date ?? "9999-12-31"
      );
    }
    if (comparison !== 0) return comparison;
    if (leftRequested !== rightRequested)
      return (leftRequested ?? Infinity) - (rightRequested ?? Infinity);
    return left.id.localeCompare(right.id);
  });

export const reconcileAwaitingSupplySelection = (
  currentId: string | null,
  availableIds: readonly string[]
) =>
  currentId && availableIds.includes(currentId)
    ? currentId
    : (availableIds[0] ?? null);
