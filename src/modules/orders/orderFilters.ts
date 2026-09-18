import type { OsOrder } from "@/features/hubos/types";
import { calculateOrderRisk, isOrderFinished } from "./risk";

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

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function matchesQuickFilter(
  order: OsOrder,
  filter: QuickOrderFilter,
  now = new Date()
) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);
  const finished = isOrderFinished(order);
  switch (filter) {
    case "active":
      return !finished;
    case "today":
      return order.delivery_date === iso(today);
    case "tomorrow":
      return order.delivery_date === iso(tomorrow);
    case "week":
      return Boolean(
        order.delivery_date &&
        order.delivery_date >= iso(today) &&
        order.delivery_date <= iso(weekEnd)
      );
    case "overdue":
      return (
        calculateOrderRisk(order, now) === "CRITICO" &&
        Boolean(order.delivery_date && order.delivery_date < iso(today))
      );
    case "urgent":
      return order.art_direction_tag === "URGENTE";
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
