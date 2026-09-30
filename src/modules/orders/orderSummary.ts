import type { OsOrder } from "@/features/hubos/types";
import { isOrderUrgent } from "@/features/hubos/orderUrgency";
import { isOrderFinished, isOrderOverdue } from "./risk";

export type OrderSummary = {
  total: number;
  active: number;
  overdue: number;
  urgent: number;
  finished: number;
};

/** Builds the operational snapshot from the records already loaded by the page. */
export function summarizeOrders(
  orders: OsOrder[],
  total = orders.length,
  now = new Date()
): OrderSummary {
  return {
    total,
    active: orders.filter(order => !order.archived && !isOrderFinished(order))
      .length,
    overdue: orders.filter(order => isOrderOverdue(order, now)).length,
    urgent: orders.filter(isOrderUrgent).length,
    finished: orders.filter(isOrderFinished).length,
  };
}
