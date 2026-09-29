import type { OsOrder } from "@/features/hubos/types";
import { addLocalDays, formatLocalDate } from "@/shared/lib/date";
import { isOrderFinished, isOrderOverdue } from "./risk";
import { isOrderUrgent } from "@/features/hubos/orderUrgency";

export type QuickOrderFilter =
  | "all"
  | "active"
  | "today"
  | "tomorrow"
  | "week"
  | "overdue"
  | "urgent"
  | "pending"
  | "finished";

export function matchesQuickFilter(
  order: OsOrder,
  filter: QuickOrderFilter,
  now = new Date()
) {
  const today = formatLocalDate(now);
  const tomorrow = formatLocalDate(addLocalDays(now, 1));
  const weekEnd = formatLocalDate(addLocalDays(now, 7));
  const finished = isOrderFinished(order);
  switch (filter) {
    case "active":
      return !finished;
    case "today":
      return order.delivery_date === today;
    case "tomorrow":
      return order.delivery_date === tomorrow;
    case "week":
      return Boolean(
        order.delivery_date &&
        order.delivery_date >= today &&
        order.delivery_date <= weekEnd
      );
    case "overdue":
      return isOrderOverdue(order, now);
    case "urgent":
      return isOrderUrgent(order);
    case "pending":
      return (
        order.production_tag === "AGUARDANDO_INSUMOS" ||
        order.art_status === "Ajustes"
      );
    case "finished":
      return finished;
    default:
      return true;
  }
}
