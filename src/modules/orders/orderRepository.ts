import { supabase } from "@/lib/supabase";
import type { OsOrder } from "@/features/hubos/types";

export type OrderListQuery = {
  page: number;
  pageSize: number;
  search?: string;
  artStatus?: string;
  prodStatus?: string;
};

export async function listOperationalOrders({
  page,
  pageSize,
  search,
  artStatus,
  prodStatus,
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

export async function listDashboardOrders(limit = 200) {
  const { data, error } = await supabase
    .from("os_orders")
    .select("*")
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as OsOrder[];
}
