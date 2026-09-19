import { supabase } from "@/lib/supabase";
import type { OsOrder } from "@/features/hubos/types";
import { addLocalDays, formatLocalDate } from "@/shared/lib/date";
import type { QuickOrderFilter } from "./orderFilters";

export type OrderListQuery = {
  page: number;
  pageSize: number;
  search?: string;
  artStatus?: string;
  prodStatus?: string;
  quickFilter?: QuickOrderFilter;
  now?: Date;
};

export type DashboardPeriod = {
  start?: string;
  end?: string;
};

export type OperationalDashboardMetrics = {
  active: number;
  art: number;
  approval: number;
  production: number;
  finish: number;
  ready: number;
  installations: number;
  overdue: number;
  today: number;
  tomorrow: number;
  letterBox: number;
  externalProduction: number;
  installationLoad: number;
};

type FilterOperation =
  | { method: "eq" | "lt" | "gte" | "lte"; column: string; value: unknown }
  | { method: "or"; expression: string };

/** Pure query plan used by the repository and unit tests. */
export function quickFilterOperations(
  filter: QuickOrderFilter = "all",
  now = new Date()
): FilterOperation[] {
  const today = formatLocalDate(now);
  const tomorrow = formatLocalDate(addLocalDays(now, 1));
  const active: FilterOperation[] = [
    { method: "eq", column: "archived", value: false },
    {
      method: "or",
      expression: "prod_status.is.null,prod_status.not.ilike.%finaliz%",
    },
  ];
  switch (filter) {
    case "active":
      return active;
    case "finished":
      return [
        {
          method: "or",
          expression: "archived.eq.true,prod_status.ilike.%finaliz%",
        },
      ];
    case "today":
      return [{ method: "eq", column: "delivery_date", value: today }];
    case "tomorrow":
      return [{ method: "eq", column: "delivery_date", value: tomorrow }];
    case "week":
      return [
        { method: "gte", column: "delivery_date", value: today },
        {
          method: "lte",
          column: "delivery_date",
          value: formatLocalDate(addLocalDays(now, 7)),
        },
      ];
    case "overdue":
      return [
        ...active,
        { method: "lt", column: "delivery_date", value: today },
      ];
    case "urgent":
      return [{ method: "eq", column: "art_direction_tag", value: "URGENTE" }];
    case "pending":
      return [
        {
          method: "or",
          expression:
            "production_tag.eq.AGUARDANDO_INSUMOS,art_status.eq.Ajustes",
        },
      ];
    default:
      return [];
  }
}

export async function listOperationalOrders({
  page,
  pageSize,
  search,
  artStatus,
  prodStatus,
  quickFilter = "all",
  now = new Date(),
}: OrderListQuery) {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(50, Math.max(10, pageSize));
  let query = supabase
    .from("os_orders")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false });
  if (search?.trim()) {
    const term = search.trim().replace(/[,%()]/g, "");
    query = query.or(
      `sale_number.ilike.%${term}%,client_name.ilike.%${term}%,title.ilike.%${term}%,description.ilike.%${term}%`
    );
  }
  if (artStatus) query = query.eq("art_status", artStatus);
  if (prodStatus) query = query.eq("prod_status", prodStatus);
  for (const operation of quickFilterOperations(quickFilter, now)) {
    if (operation.method === "or") query = query.or(operation.expression);
    else if (operation.method === "eq")
      query = query.eq(operation.column, operation.value);
    else if (operation.method === "lt")
      query = query.lt(operation.column, operation.value);
    else if (operation.method === "gte")
      query = query.gte(operation.column, operation.value);
    else query = query.lte(operation.column, operation.value);
  }
  const from = (safePage - 1) * safeSize;
  const { data, count, error } = await query.range(from, from + safeSize - 1);
  if (error) throw new Error(error.message);
  return {
    orders: (data ?? []) as OsOrder[],
    total: count ?? 0,
    page: safePage,
    pageSize: safeSize,
  };
}

export async function getOperationalDashboardMetrics(
  period: DashboardPeriod,
  now = new Date()
) {
  const { data, error } = await supabase.rpc(
    "get_operational_dashboard_metrics",
    {
      p_today: formatLocalDate(now),
      p_period_start: period.start ?? null,
      p_period_end: period.end ?? null,
    }
  );
  if (error) throw new Error(error.message);
  return data as unknown as OperationalDashboardMetrics;
}

export async function listOperationalAttentionOrders(
  limit = 8,
  now = new Date()
) {
  const today = formatLocalDate(now);
  const near = formatLocalDate(addLocalDays(now, 2));
  const idle = new Date(now.getTime() - 4 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("os_orders")
    .select("*")
    .eq("archived", false)
    .or("prod_status.is.null,prod_status.not.ilike.%finaliz%")
    .or(
      `delivery_date.lt.${today},delivery_date.lte.${near},updated_at.lte.${idle}`
    )
    .order("delivery_date", { ascending: true, nullsFirst: false })
    .limit(Math.min(20, Math.max(1, limit)));
  if (error) throw new Error(error.message);
  return (data ?? []) as OsOrder[];
}
