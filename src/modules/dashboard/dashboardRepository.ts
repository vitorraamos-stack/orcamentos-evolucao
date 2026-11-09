import { supabase } from "@/lib/supabase";
import { loadUserDisplayNamesByIds } from "@/shared/repositories/userDisplayNamesRepository";
import type { DashboardOrder } from "./dashboardModel";

/**
 * Read-only, RLS-scoped snapshot for the operational dashboard.
 * Enumerate every page rather than ranking an arbitrary first page.
 * A changing total or duplicate ID is not a valid "zero" or completed result.
 */
const PROJECTION =
  "id,sale_number,client_name,title,delivery_date,updated_at,prod_status,art_status,production_tag,logistic_type,archived,is_urgent,art_direction_tag";
const PAGE_SIZE = 500;

async function readDashboardOrders(signal?: AbortSignal): Promise<DashboardOrder[]> {
  const orders: DashboardOrder[] = [];
  let expected: number | null = null;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase.from("os_orders")
      .select(PROJECTION, { count: "exact" })
      .eq("archived", false)
      .or("prod_status.is.null,prod_status.not.ilike.%finaliz%")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (signal) query = query.abortSignal(signal);
    const { data, count, error } = await query;
    if (error) throw new Error(error.message);
    if (count === null || !Number.isSafeInteger(count) || count < 0)
      throw new Error("A contagem das OS não pôde ser confirmada.");
    if (expected === null) expected = count;
    if (expected !== count)
      throw new Error("As ordens mudaram durante a atualização.");
    const batch = (data ?? []) as unknown as DashboardOrder[];
    orders.push(...batch);
    if (orders.length >= expected) break;
    if (batch.length !== PAGE_SIZE)
      throw new Error("A consulta de OS foi interrompida. Atualize novamente.");
  }
  if (orders.length !== expected || new Set(orders.map(order => order.id)).size !== expected)
    throw new Error("A consulta de OS mudou durante a paginação.");
  return orders;
}

/** Reconcile once if the snapshot changes during pagination. */
export async function listDashboardOrders(signal?: AbortSignal) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await readDashboardOrders(signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      if (attempt === 1 || !(error instanceof Error) ||
          !/mudaram|mudou durante|interrompida/.test(error.message)) throw error;
    }
  }
  throw new Error("Não foi possível confirmar a consulta de OS.");
}

export type DashboardAssignee = {
  order_id: string;
  scope: string;
  name: string | null;
  email: string | null;
};

/** Only enrich the five visible OS. Never query every user's profile. */
export async function listDashboardAssignees(ids: string[], signal?: AbortSignal): Promise<DashboardAssignee[]> {
  if (!ids.length) return [];
  let query = supabase.from("os_order_assignees")
    .select("order_id,user_id,scope,profiles!os_order_assignees_user_id_fkey(email)")
    .in("order_id", ids);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const names = await loadUserDisplayNamesByIds(rows.map(row => row.user_id));
  return rows.map(row => {
    const profile = row.profiles as unknown as { email?: string | null } | { email?: string | null }[] | null;
    const value = Array.isArray(profile) ? profile[0] : profile;
    return {
      order_id: row.order_id,
      scope: row.scope,
      name: names.get(row.user_id)?.name ?? value?.email ?? null,
      email: value?.email ?? null,
    };
  });
}
