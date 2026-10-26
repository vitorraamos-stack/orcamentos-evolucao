import { supabase } from "@/lib/supabase";
import type { OsOrder } from "@/features/hubos/types";
import { addLocalDays, formatLocalDate } from "@/shared/lib/date";
import type { QuickOrderFilter } from "./orderFilters";
import { getConsultantFinancePendingSummary } from "@/features/hubos/financePending";
import { sortOperationalOrderPriority, type OrderPriorityRow } from "./orderPriority";

export type OrderListQuery = {
  page: number;
  pageSize: number;
  search?: string;
  artStatus?: string;
  prodStatus?: string;
  urgent?: boolean;
  logisticType?: OsOrder["logistic_type"];
  quickFilter?: QuickOrderFilter;
  now?: Date;
  locateOrderId?: string;
  signal?: AbortSignal;
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

export type OperationalAttentionMetrics = {
  awaitingSupplies: number;
  financePending: number;
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
      return [
        {
          method: "or",
          expression: "is_urgent.eq.true,art_direction_tag.eq.URGENTE",
        },
      ];
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

const PRIORITY_PROJECTION =
  "id,delivery_date,updated_at,prod_status,logistic_type,archived,is_urgent,art_direction_tag";
const PRIORITY_BATCH_SIZE = 500;

class OrderSnapshotChanged extends Error {
  constructor() {
    super("A consulta de ordens mudou durante a paginação. Tente novamente.");
  }
}

/**
 * Server filters and RLS remain unchanged. Read ONLY the columns needed to
 * rank all permitted matching orders, then load full data for the 25 selected
 * ids. Never sort one server page and misrepresent it as global ordering.
 */
function filteredOrderPriorityQuery({
  search,
  artStatus,
  prodStatus,
  urgent,
  logisticType,
  quickFilter = "all",
  now,
  signal,
}: Omit<OrderListQuery, "page" | "pageSize">) {
  let query = supabase
    .from("os_orders")
    .select(PRIORITY_PROJECTION, { count: "exact" })
    .order("id", { ascending: true });
  if (signal) query = query.abortSignal(signal);
  if (search?.trim()) {
    const term = search.trim().replace(/[,%()]/g, "");
    query = query.or(
      `sale_number.ilike.%${term}%,client_name.ilike.%${term}%,title.ilike.%${term}%,description.ilike.%${term}%`
    );
  }
  if (artStatus) query = query.eq("art_status", artStatus);
  if (prodStatus) query = query.eq("prod_status", prodStatus);
  if (urgent === true)
    query = query.or("is_urgent.eq.true,art_direction_tag.eq.URGENTE");
  else if (urgent === false)
    query = query
      .eq("is_urgent", false)
      .or("art_direction_tag.is.null,art_direction_tag.neq.URGENTE");
  if (logisticType) query = query.eq("logistic_type", logisticType);
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
  return query;
}

async function readOperationalOrderPage(input: OrderListQuery, now: Date) {
  const safePage = Math.max(1, Math.floor(input.page || 1));
  const safeSize = Math.min(50, Math.max(10, Math.floor(input.pageSize || 25)));
  const matches: OrderPriorityRow[] = [];
  let expectedTotal: number | null = null;
  for (let offset = 0; ; offset += PRIORITY_BATCH_SIZE) {
    const { data, count, error } = await filteredOrderPriorityQuery({
      ...input,
      now,
    }).range(offset, offset + PRIORITY_BATCH_SIZE - 1);
    if (error) throw new Error(error.message);
    if (count === null || !Number.isSafeInteger(count) || count < 0) {
      throw new Error("Não foi possível confirmar a contagem da consulta.");
    }
    if (expectedTotal === null) expectedTotal = count;
    if (count !== expectedTotal) throw new OrderSnapshotChanged();
    const batch = (data ?? []) as unknown as OrderPriorityRow[];
    matches.push(...batch);
    // A short intermediate batch is not a valid completed query if total
    // declares more records. It can indicate concurrent edits during paging.
    if (matches.length >= expectedTotal) break;
    if (batch.length !== PRIORITY_BATCH_SIZE) throw new OrderSnapshotChanged();
  }
  const total = expectedTotal ?? 0;
  if (matches.length !== total || new Set(matches.map(row => row.id)).size !== total) {
    throw new OrderSnapshotChanged();
  }
  const pageCount = Math.max(1, Math.ceil(total / safeSize));
  const ordered = sortOperationalOrderPriority(matches, now);
  // Locate only within the filtered, RLS-authorized result set. Never override
  // filters to reveal an OS that no longer belongs to this consultation.
  const locatedIndex = input.locateOrderId
    ? ordered.findIndex(row => row.id === input.locateOrderId)
    : -1;
  const locatedOrderId = locatedIndex >= 0 ? input.locateOrderId ?? null : null;
  const validPage = locatedIndex >= 0
    ? Math.floor(locatedIndex / safeSize) + 1
    : Math.min(safePage, pageCount);
  if (total === 0) {
    return { orders: [] as OsOrder[], total, page: 1, pageSize: safeSize,
      locatedOrderId: null };
  }
  const ids = ordered
    .slice((validPage - 1) * safeSize, validPage * safeSize)
    .map(row => row.id);
  let detailsQuery = supabase
    .from("os_orders")
    .select("*")
    .in("id", ids);
  if (input.signal) detailsQuery = detailsQuery.abortSignal(input.signal);
  const { data, error } = await detailsQuery;
  if (error) throw new Error(error.message);
  const byId = new Map(((data ?? []) as OsOrder[]).map(row => [row.id, row]));
  if (byId.size !== ids.length ||
      ids.some(id => byId.get(id)?.updated_at !== matches.find(row => row.id === id)?.updated_at)) {
    throw new OrderSnapshotChanged();
  }
  return {
    orders: ids.map(id => byId.get(id)!),
    total,
    page: validPage,
    pageSize: safeSize,
    locatedOrderId,
  };
}

export async function listOperationalOrders(input: OrderListQuery) {
  const now = input.now ?? new Date();
  // One automatic retry only for a confirmed concurrent-snapshot change.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await readOperationalOrderPage(input, now);
    } catch (error) {
      if (!(error instanceof OrderSnapshotChanged) || attempt === 1) throw error;
    }
  }
  throw new OrderSnapshotChanged();
}

/** Lightweight, unfiltered dataset used only by the summary cards. */
export async function listOperationalOrderSummaryRows() {
  const pageSize = 1000;
  const orders: OsOrder[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("os_orders")
      .select(
        "id,delivery_date,prod_status,art_status,archived,is_urgent,art_direction_tag"
      )
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as OsOrder[];
    orders.push(...page);
    if (page.length < pageSize) break;
    const next = from + page.length;
    if (next <= from) break;
    from = next;
  }
  return { orders, total: orders.length };
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

export async function getOperationalAttentionMetrics(): Promise<OperationalAttentionMetrics> {
  const { count, error } = await supabase
    .from("os_orders")
    .select("id", { count: "exact", head: true })
    .eq("production_tag", "AGUARDANDO_INSUMOS")
    .or("archived.is.null,archived.eq.false")
    .or("prod_status.is.null,prod_status.not.ilike.%finaliz%");
  if (error) throw new Error(error.message);

  // Only installments that still require action are queried. Counting distinct
  // OS prevents multiple pending installments from inflating the dashboard.
  const financeSummary = await getConsultantFinancePendingSummary();
  return {
    awaitingSupplies: count ?? 0,
    financePending: financeSummary.totalOrders,
  };
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
