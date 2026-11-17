import { supabase } from "@/lib/supabase";
import { ORDER_DETAIL_SELECT } from "@/modules/orders/repositories/orderDetailRepository";
import type { OsOrder } from "@/features/hubos/types";
import { WORK_CENTER_LABELS, type ItemOperation } from "@/modules/production/operations";
import type { OrderItem, AssigneeScope, OrderDeadline } from "@/modules/orders/types/orderDetail";
import type { Installation } from "@/modules/installations/types";
import { fetchAllPages } from "@/shared/kanban/boardPagination";
import { localDateKey, type MyQueueRow, type QueueAction, type QueueStatus } from "./myQueueModel";

type Assignee = { order_id: string; user_id: string; scope: AssigneeScope };
type Item = Pick<OrderItem, "id" | "order_id" | "name" | "quantity" | "unit" | "status" | "sort_order">;
type Deadline = Pick<OrderDeadline, "order_id" | "scope" | "due_date" | "completed_at">;
type TeamMember = { team_id: string; user_id: string };
const scopes: AssigneeScope[] = ["GENERAL", "ART", "PRODUCTION", "FINISHING", "INSTALLATION"];
const recentDays = 30;

async function allRows<T>(getPage: (start: number, end: number) => Promise<T[]>) {
  return fetchAllPages<T>(getPage);
}

async function chunks<T>(ids: string[], fetch: (ids: string[]) => Promise<T[]>): Promise<T[]> {
  const unique = Array.from(new Set(ids));
  if (!unique.length) return [];
  const output: T[] = [];
  for (let i = 0; i < unique.length; i += 100) {
    output.push(...await fetch(unique.slice(i, i + 100)));
  }
  return output;
}

function after(date: string | null | undefined, cutoff: string) {
  return Boolean(date && date.slice(0, 10) >= cutoff);
}

function dateBeforeDays(now: Date, days: number) {
  const day = new Date(now);
  day.setDate(day.getDate() - days);
  return day.toISOString().slice(0, 10);
}

function activityDeadline(order: OsOrder, deadlines: Deadline[], scope: string, scheduled?: string | null) {
  if (scheduled) return { dueDate: localDateKey(new Date(scheduled)), dueKind: "schedule" as const };
  const deadline = deadlines.find(row => row.scope === scope && !row.completed_at);
  if (deadline) return { dueDate: deadline.due_date, dueKind: "stage" as const };
  return { dueDate: order.delivery_date, dueKind: "order" as const };
}

/** A leitura é sempre limitada ao usuário autenticado, sem consultar tarefas de terceiros. */
export async function listMyQueue(userId: string, allowInstallations: boolean): Promise<MyQueueRow[]> {
  const [assignees, operations, memberships, ownInstallations] = await Promise.all([
    allRows<Assignee>(async (start, end) => {
      const { data, error } = await supabase.from("os_order_assignees")
        .select("order_id,user_id,scope").eq("user_id", userId).in("scope", scopes)
        .order("order_id").order("scope").range(start, end);
      if (error) throw error;
      return (data ?? []) as Assignee[];
    }),
    allRows<ItemOperation>(async (start, end) => {
      const { data, error } = await supabase.from("os_order_item_operations")
        .select("id,item_id,work_center,status,assigned_to,is_required,notes,blocked_reason,sort_order,started_at,completed_at,created_at,updated_at")
        .eq("assigned_to", userId).is("deleted_at", null).order("id").range(start, end);
      if (error) throw error;
      return (data ?? []) as ItemOperation[];
    }),
    allowInstallations ? supabase.from("os_installation_team_members").select("team_id,user_id").eq("user_id", userId)
      .then(({ data, error }) => { if (error) throw error; return (data ?? []) as TeamMember[]; })
      : Promise.resolve([] as TeamMember[]),
    allowInstallations ? allRows<Installation>(async (start, end) => {
      const { data, error } = await supabase.from("os_installations")
        .select("*").eq("responsible_id", userId).order("id").range(start, end);
      if (error) throw error;
      return (data ?? []) as Installation[];
    }) : Promise.resolve([] as Installation[]),
  ]);

  const teamIds = memberships.map(row => row.team_id);
  const teamInstallations = allowInstallations ? await chunks(teamIds, async ids => {
    const { data, error } = await supabase.from("os_installations").select("*").in("team_id", ids);
    if (error) throw error;
    return (data ?? []) as Installation[];
  }) : [];
  const installationMap = new Map([...ownInstallations, ...teamInstallations].map(row => [row.id, row]));
  const installations = Array.from(installationMap.values());

  const itemRows = await chunks(operations.map(row => row.item_id), async ids => {
    const { data, error } = await supabase.from("os_order_items")
      .select("id,order_id,name,quantity,unit,status,sort_order").in("id", ids).is("deleted_at", null);
    if (error) throw error;
    return (data ?? []) as Item[];
  });
  const itemsById = new Map(itemRows.map(row => [row.id, row]));
  const orderIds = [...assignees.map(row => row.order_id), ...itemRows.map(row => row.order_id),
    ...installations.map(row => row.os_id)];
  const orders = await chunks<OsOrder>(orderIds, async ids => {
    const { data, error } = await supabase.from("os_orders").select(ORDER_DETAIL_SELECT).in("id", ids)
      .eq("archived", false);
    if (error) throw error;
    return (data ?? []) as OsOrder[];
  });
  const orderById = new Map(orders.map(row => [row.id, row]));
  const deadlines = await chunks<Deadline>(orders.map(row => row.id), async ids => {
    const { data, error } = await supabase.from("os_order_deadlines")
      .select("order_id,scope,due_date,completed_at").in("order_id", ids);
    if (error) throw error;
    return (data ?? []) as Deadline[];
  });
  const deadlineByOrder = new Map<string, Deadline[]>();
  deadlines.forEach(row => deadlineByOrder.set(row.order_id, [...(deadlineByOrder.get(row.order_id) ?? []), row]));
  const firstItems = await chunks<Item>(orders.map(row => row.id), async ids => {
    const { data, error } = await supabase.from("os_order_items")
      .select("id,order_id,name,quantity,unit,status,sort_order").in("order_id", ids)
      .is("deleted_at", null).neq("status", "CANCELLED").order("sort_order");
    if (error) throw error;
    return (data ?? []) as Item[];
  });
  const firstByOrder = new Map<string, Item>();
  firstItems.forEach(item => { if (!firstByOrder.has(item.order_id)) firstByOrder.set(item.order_id, item); });
  const formatItem = (item?: Item) => item ? item.name + " · " + item.quantity + " " + item.unit : null;
  const cutoff = dateBeforeDays(new Date(), recentDays);
  const output: MyQueueRow[] = [];
  const operationOrders = new Set<string>();

  for (const operation of operations) {
    const item = itemsById.get(operation.item_id);
    const order = item ? orderById.get(item.order_id) : undefined;
    if (!item || !order || item.status === "CANCELLED" || !operation.is_required) continue;
    if (!order.prod_status || order.prod_status === "Finalizados") continue;
    if (operation.status === "COMPLETED" && !after(operation.completed_at, cutoff)) continue;
    if (operation.status !== "COMPLETED") operationOrders.add(order.id);
    const waiting = order.production_tag === "PRODUCAO_EXTERNA";
    const blocked = operation.status === "BLOCKED" || order.production_tag === "AGUARDANDO_INSUMOS";
    const status: QueueStatus = operation.status === "COMPLETED" ? "DONE" :
      blocked ? "BLOCKED" : waiting ? "WAITING" :
      operation.status === "IN_PROGRESS" ? "IN_PROGRESS" : "TODO";
    const action: QueueAction = blocked || waiting ? "OPEN_PRODUCTION" :
      status === "TODO" ? "START_OPERATION" : status === "IN_PROGRESS" ? "FINISH_OPERATION" : "OPEN_OS";
    const finishing = operation.work_center === "FINISHING_QC";
    output.push({
      id: "operation:" + operation.id, orderId: order.id, order,
      kind: "OPERATION", sector: WORK_CENTER_LABELS[operation.work_center],
      activity: WORK_CENTER_LABELS[operation.work_center],
      itemLabel: formatItem(item), status, action,
      ...activityDeadline(order, deadlineByOrder.get(order.id) ?? [], finishing ? "FINISHING" : "PRODUCTION"),
      urgent: order.is_urgent || order.art_direction_tag === "URGENTE",
      updatedAt: operation.updated_at, operation,
    });
  }

  for (const assignee of assignees) {
    const order = orderById.get(assignee.order_id);
    if (!order || order.prod_status === "Finalizados") continue;
    const base = { orderId: order.id, order, itemLabel: formatItem(firstByOrder.get(order.id)),
      urgent: order.is_urgent || order.art_direction_tag === "URGENTE", updatedAt: order.updated_at };
    const deadlinesForOrder = deadlineByOrder.get(order.id) ?? [];
    if (assignee.scope === "ART" && !order.prod_status) {
      const artStatus = order.art_status;
      const status: QueueStatus = artStatus === "Para Aprovação" ? "WAITING" :
        artStatus === "Em Criação" || artStatus === "Ajustes" ? "IN_PROGRESS" : "TODO";
      const action: QueueAction = artStatus === "Caixa de Entrada" || artStatus === "Fila de Arte" ? "START_ART" :
        artStatus === "Ajustes" ? "RETAKE_ART" :
        artStatus === "Em Criação" ? "SEND_APPROVAL" :
        artStatus === "Para Aprovação" ? "RELEASE_LAYOUT" : "OPEN_OS";
      output.push({ ...base, id: "art:" + order.id, kind: "ART", sector: "Arte",
        activity: artStatus === "Para Aprovação" ? "Acompanhar aprovação da arte" :
          artStatus === "Produzir" ? "Conferir liberação" :
          artStatus === "Ajustes" ? "Realizar ajustes" : "Criar / preparar arte",
        status, action, ...activityDeadline(order, deadlinesForOrder, "ART") });
    }
    if (assignee.scope === "GENERAL" && !order.prod_status && order.art_status === "Para Aprovação") {
      output.push({ ...base, id: "general-approval:" + order.id, kind: "ART", sector: "Comercial",
        activity: "Acompanhar aprovação do cliente", status: "WAITING", action: "OPEN_OS",
        ...activityDeadline(order, deadlinesForOrder, "APPROVAL") });
    }
    if ((assignee.scope === "PRODUCTION" || assignee.scope === "FINISHING") && !operationOrders.has(order.id)) {
      const finishing = assignee.scope === "FINISHING";
      if (finishing ? order.prod_status !== "Em Acabamento" :
        order.prod_status !== "Produção" && order.prod_status !== "Pronto / Avisar Cliente") continue;
      const blocked = order.production_tag === "AGUARDANDO_INSUMOS";
      const waiting = order.production_tag === "PRODUCAO_EXTERNA";
      const materialReady = order.prod_status === "Pronto / Avisar Cliente";
      output.push({ ...base, id: assignee.scope.toLowerCase() + ":" + order.id,
        kind: assignee.scope, sector: finishing ? "Acabamento" : "Produção",
        activity: materialReady ? "Avisar cliente / encaminhar logística" :
          finishing ? "Executar acabamento / conferência" : "Acompanhar produção",
        status: blocked ? "BLOCKED" : waiting ? "WAITING" : "TODO",
        action: materialReady ? "OPEN_OS" : "OPEN_PRODUCTION",
        ...activityDeadline(order, deadlinesForOrder, assignee.scope) });
    }
  }

  const currentInstallationOrderIds = new Set(installations.filter(i => i.status !== "CANCELLED").map(i => i.os_id));
  for (const installation of installations) {
    const order = orderById.get(installation.os_id);
    if (!order || installation.status === "CANCELLED") continue;
    if (installation.status === "COMPLETED" && !after(installation.completed_at, cutoff)) continue;
    const status: QueueStatus = installation.status === "COMPLETED" ? "DONE" :
      installation.status === "IN_PROGRESS" ? "IN_PROGRESS" : "TODO";
    output.push({
      id: "installation:" + installation.id, orderId: order.id, order, kind: "INSTALLATION",
      sector: "Instalação", activity: "Executar instalação",
      itemLabel: formatItem(firstByOrder.get(order.id)), status,
      action: status === "DONE" ? "OPEN_OS" : "OPEN_INSTALLATION",
      ...activityDeadline(order, deadlineByOrder.get(order.id) ?? [], "INSTALLATION", installation.scheduled_start),
      updatedAt: installation.updated_at, urgent: order.is_urgent || order.art_direction_tag === "URGENTE",
      installationId: installation.id,
    });
  }
  if (allowInstallations) for (const assignee of assignees) {
    if (assignee.scope !== "INSTALLATION" || currentInstallationOrderIds.has(assignee.order_id)) continue;
    const order = orderById.get(assignee.order_id);
    if (!order || order.logistic_type !== "instalacao" || order.prod_status !== "Pronto / Avisar Cliente") continue;
    output.push({ id: "installation-pending:" + order.id, orderId: order.id, order,
      kind: "INSTALLATION", sector: "Instalação", activity: "Agendar instalação",
      itemLabel: formatItem(firstByOrder.get(order.id)), status: "TODO", action: "OPEN_INSTALLATION",
      ...activityDeadline(order, deadlineByOrder.get(order.id) ?? [], "INSTALLATION"),
      updatedAt: order.updated_at, urgent: order.is_urgent || order.art_direction_tag === "URGENTE" });
  }
  return output;
}
