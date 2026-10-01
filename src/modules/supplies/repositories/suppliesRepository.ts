import { supabase } from "@/lib/supabase";
import type { OsOrder } from "@/features/hubos/types";
import { calculateOrderRisk } from "@/modules/orders/risk";

export const AWAITING_SUPPLIES_SELECT =
  "id,os_number,sale_number,client_name,title,description,delivery_date,delivery_deadline_preset,art_status,prod_status,production_tag,insumos_details,insumos_return_notes,insumos_requested_at,insumos_resolved_at,insumos_resolved_by,is_urgent,art_direction_tag,created_at,updated_at,logistic_type,address,archived";

export function sortAwaitingSuppliesOrders(orders: OsOrder[]) {
  const rank = { CRITICO: 0, ATENCAO: 1, NORMAL: 2 } as const;
  return [...orders].sort(
    (a, b) =>
      rank[calculateOrderRisk(a)] - rank[calculateOrderRisk(b)] ||
      Number(Boolean(b.is_urgent || b.art_direction_tag === "URGENTE")) -
        Number(Boolean(a.is_urgent || a.art_direction_tag === "URGENTE")) ||
      (a.delivery_date ?? "9999").localeCompare(b.delivery_date ?? "9999") ||
      (a.insumos_requested_at ?? "9999").localeCompare(
        b.insumos_requested_at ?? "9999"
      )
  );
}

export async function listAwaitingSuppliesOrders() {
  const rows: OsOrder[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("os_orders")
      .select(AWAITING_SUPPLIES_SELECT)
      .eq("production_tag", "AGUARDANDO_INSUMOS")
      .or("archived.is.null,archived.eq.false")
      .or("prod_status.is.null,prod_status.not.ilike.%finaliz%")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as OsOrder[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return sortAwaitingSuppliesOrders(rows);
}
