import type { OsOrder } from "@/features/hubos/types";
import { isOrderUrgent } from "@/features/hubos/orderUrgency";
import { calculateOrderRisk, isOrderFinished } from "./risk";

/** Only existing operational facts are used; no workflow status is redefined. */
export type OrderPriorityRow = Pick<
  OsOrder,
  | "id"
  | "delivery_date"
  | "updated_at"
  | "prod_status"
  | "logistic_type"
  | "archived"
  | "is_urgent"
  | "art_direction_tag"
>;

const riskRank = { CRITICO: 0, ATENCAO: 1, NORMAL: 2 } as const;

/**
 * Global presentation order: active before finished, existing risk severity,
 * existing urgency, earliest deadline, newest update, immutable id.
 * The reference time is frozen per consultation to avoid mid-query re-ranking.
 */
export function sortOperationalOrderPriority<T extends OrderPriorityRow>(
  rows: readonly T[],
  now: Date
): T[] {
  const ranked = rows.map(row => ({
    row,
    finished: isOrderFinished(row) ? 1 : 0,
    risk: riskRank[calculateOrderRisk(row, now)],
    urgent: isOrderUrgent(row) ? 0 : 1,
    due: row.delivery_date ?? "9999-12-31",
    updated: row.updated_at ?? "",
  }));
  ranked.sort(
    (a, b) =>
      a.finished - b.finished ||
      a.risk - b.risk ||
      a.urgent - b.urgent ||
      a.due.localeCompare(b.due) ||
      b.updated.localeCompare(a.updated) ||
      a.row.id.localeCompare(b.row.id)
  );
  return ranked.map(entry => entry.row);
}
