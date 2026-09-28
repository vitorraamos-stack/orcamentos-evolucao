import { supabase } from "@/lib/supabase";
import { calculateOrderRisk } from "@/modules/orders/risk";
import type { BoardAssignee, BoardCardModel, BoardKind } from "./types";
import type { OsOrder } from "@/features/hubos/types";
import { fetchAllPages } from "./boardPagination";
import { operationSummary, type ItemOperation } from "@/modules/production/operations";
export const RECENT_FINISHED_LIMIT = 100;
export const RECENT_FINISHED_DAYS = 30;

const ORDER_FIELDS =
  "id,os_number,sale_number,client_name,title,description,delivery_date,delivery_deadline_preset,delivery_deadline_started_at,logistic_type,address,production_tag,insumos_details,insumos_return_notes,insumos_requested_at,insumos_resolved_at,insumos_resolved_by,art_direction_tag,art_status,prod_status,reproducao,letra_caixa,archived,archived_at,archived_by,created_by,updated_by,created_at,updated_at";

export async function listBoardOrders(
  board: BoardKind
): Promise<BoardCardModel[]> {
  const active = await fetchAllPages<OsOrder>(async (from, to) => {
    let query = supabase
      .from("os_orders")
      .select(ORDER_FIELDS)
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .range(from, to);
    query = board === "art"
      ? query.or(
          "and(prod_status.is.null,art_status.in.(\"Caixa de Entrada\",\"Fila de Arte\",\"Em Criação\",\"Para Aprovação\",Ajustes)),and(art_status.eq.Produzir,prod_status.eq.Produção)"
        )
      : query.in("prod_status", [
          "Produção",
          "Em Acabamento",
          "Pronto / Avisar Cliente",
        ]);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as OsOrder[];
  });
  const rows = active;
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
      .select("id,order_id,status")
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
  const assigneeByOrderId = new Map(
    (assignees.data ?? []).map(row => [row.order_id, row])
  );
  const itemsByOrderId = groupByOrderId(items.data ?? []);
  const commentsByOrderId = groupByOrderId(comments.data ?? []);
  const deadlinesByOrderId = groupByOrderId(deadlines.data ?? []);
  const itemRows = items.data ?? [];
  const operationRows = await fetchOperationsChunked(itemRows.map(item => item.id));
  const operationsByItemId = new Map<string, ItemOperation[]>();
  for (const operation of operationRows) {
    const values = operationsByItemId.get(operation.item_id) ?? [];
    values.push(operation); operationsByItemId.set(operation.item_id, values);
  }
  return rows.map(order => {
    const assignment = assigneeByOrderId.get(order.id);
    const profile = assignment?.profiles as unknown as {
      email?: string | null;
    } | null;
    const orderItems = itemsByOrderId.get(order.id) ?? [];
    const operations = orderItems.flatMap(item => operationsByItemId.get(item.id) ?? []);
    const production = operationSummary(operations);
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
      deadlines: (deadlinesByOrderId.get(order.id) ?? []).map(row => ({
        scope: row.scope,
        dueDate: row.due_date,
        completedAt: row.completed_at,
      })) as BoardCardModel["deadlines"],
      itemsTotal: orderItems.length,
      itemsReady: orderItems.filter(item => item.status === "READY").length,
      commentsTotal: commentsByOrderId.get(order.id)?.length ?? 0,
      risk: calculateOrderRisk(order),
      productionOperationsTotal: production.total,
      productionOperationsCompleted: production.completed,
      productionOperationsBlocked: production.blocked,
      activeWorkCenters: production.activeWorkCenters,
      operationWorkCenters: Array.from(new Set(operations.filter(value => value.status !== "COMPLETED").map(value => value.work_center))),
      operationAssigneeIds: Array.from(new Set(operations.filter(value => value.status !== "COMPLETED" && value.assigned_to).map(value => value.assigned_to!))),
    };
  });
}

async function fetchOperationsChunked(itemIds: string[]) {
  const chunks: string[][] = [];
  for (let index = 0; index < itemIds.length; index += 200) chunks.push(itemIds.slice(index, index + 200));
  const results: ItemOperation[] = [];
  for (let index = 0; index < chunks.length; index += 4) {
    const batch = await Promise.all(chunks.slice(index, index + 4).map(ids => supabase.from("os_order_item_operations").select("id,item_id,work_center,status,assigned_to,is_required,notes,blocked_reason,sort_order,started_at,completed_at,created_at,updated_at").in("item_id", ids).is("deleted_at", null)));
    for (const result of batch) { if (result.error) throw result.error; results.push(...((result.data ?? []) as ItemOperation[])); }
  }
  return results;
}

function groupByOrderId<T extends { order_id: string }>(rows: T[]) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const values = grouped.get(row.order_id) ?? [];
    values.push(row);
    grouped.set(row.order_id, values);
  }
  return grouped;
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
