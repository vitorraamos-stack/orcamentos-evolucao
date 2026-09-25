import { supabase } from "@/lib/supabase";
import { calculateOrderRisk } from "@/modules/orders/risk";
import type { BoardAssignee, BoardCardModel, BoardKind } from "./types";
import type { OsOrder } from "@/features/hubos/types";

const ORDER_FIELDS =
  "id,os_number,sale_number,client_name,title,description,delivery_date,delivery_deadline_preset,delivery_deadline_started_at,logistic_type,address,production_tag,insumos_details,insumos_return_notes,insumos_requested_at,insumos_resolved_at,insumos_resolved_by,art_direction_tag,art_status,prod_status,reproducao,letra_caixa,archived,archived_at,archived_by,created_by,updated_by,created_at,updated_at";

export async function listBoardOrders(
  board: BoardKind
): Promise<BoardCardModel[]> {
  let query = supabase
    .from("os_orders")
    .select(ORDER_FIELDS)
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(500);
  query =
    board === "art"
      ? query.is("prod_status", null)
      : query.not("prod_status", "is", null);
  const { data: orders, error } = await query;
  if (error) throw error;
  const rows = (orders ?? []) as unknown as OsOrder[];
  const ids = rows.map(row => row.id);
  if (!ids.length) return [];
  const scope = board === "art" ? "ART" : "PRODUCTION";
  const [assignees, items, comments, deadlines] = await Promise.all([
    supabase
      .from("os_order_assignees")
      .select(
        "order_id,user_id,profiles!os_order_assignees_user_id_fkey(email)"
      )
      .in("order_id", ids)
      .eq("scope", scope),
    supabase
      .from("os_order_items")
      .select("order_id,status")
      .in("order_id", ids)
      .is("deleted_at", null),
    supabase
      .from("os_order_comments")
      .select("order_id")
      .in("order_id", ids)
      .is("deleted_at", null),
    supabase
      .from("os_order_deadlines")
      .select("order_id,scope,due_date,completed_at")
      .in("order_id", ids)
      .is("completed_at", null),
  ]);
  for (const result of [assignees, items, comments, deadlines])
    if (result.error) throw result.error;
  return rows.map(order => {
    const assignment = assignees.data?.find(row => row.order_id === order.id);
    const profile = assignment?.profiles as unknown as {
      email?: string | null;
    } | null;
    const orderItems =
      items.data?.filter(row => row.order_id === order.id) ?? [];
    return {
      order,
      assignee: assignment
        ? {
            userId: assignment.user_id,
            name:
              profile?.email?.split("@")[0] || profile?.email || "Responsável",
            email: profile?.email ?? null,
          }
        : null,
      deadlines: (deadlines.data ?? [])
        .filter(row => row.order_id === order.id)
        .map(row => ({
          scope: row.scope,
          dueDate: row.due_date,
          completedAt: row.completed_at,
        })) as BoardCardModel["deadlines"],
      itemsTotal: orderItems.length,
      itemsReady: orderItems.filter(item => item.status === "READY").length,
      commentsTotal:
        comments.data?.filter(row => row.order_id === order.id).length ?? 0,
      risk: calculateOrderRisk(order),
    };
  });
}

export async function listBoardAssignees(
  board: BoardKind
): Promise<BoardAssignee[]> {
  const scope = board === "art" ? "ART" : "PRODUCTION";
  const { data, error } = await supabase
    .from("os_order_assignees")
    .select("user_id,profiles!os_order_assignees_user_id_fkey(email)")
    .eq("scope", scope);
  if (error) throw error;
  const unique = new Map<string, BoardAssignee>();
  for (const row of data ?? []) {
    const profile = row.profiles as unknown as { email?: string | null } | null;
    unique.set(row.user_id, {
      userId: row.user_id,
      name: profile?.email?.split("@")[0] || profile?.email || "Responsável",
      email: profile?.email ?? null,
    });
  }
  return Array.from(unique.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}
