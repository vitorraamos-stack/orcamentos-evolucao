import { z } from "zod";
import { supabase } from "@/lib/supabase";
import type { OsOrder, OsOrderLayoutAsset } from "@/features/hubos/types";
import type {
  AssigneeScope,
  DeadlineScope,
  OrderActivity,
  OrderAssignee,
  OrderComment,
  OrderDeadline,
  OrderDetail,
  OrderItem,
  OrderItemStatus,
  UserOption,
} from "../types/orderDetail";

export const ORDER_DETAIL_SELECT =
  "id,os_number,sale_number,client_name,title,description,delivery_date,delivery_deadline_preset,delivery_deadline_started_at,logistic_type,address,address_lat,address_lng,address_geocoded_at,address_geocode_provider,production_tag,insumos_details,insumos_return_notes,insumos_requested_at,insumos_resolved_at,insumos_resolved_by,art_direction_tag,art_status,prod_status,reproducao,letra_caixa,archived,archived_at,archived_by,folder_path,created_by,updated_by,created_at,updated_at";
export const ORDER_ASSET_SELECT =
  "id,os_id,asset_type,object_path,original_name,mime_type,size_bytes,storage_provider,storage_bucket,bucket,uploaded_at,deleted_from_storage_at,r2_etag,error";

const uuid = z.string().uuid();
const assigneeInput = z.object({ orderId: uuid, userId: uuid, scope: z.enum(["GENERAL", "ART", "PRODUCTION", "FINISHING", "INSTALLATION"]) });
const deadlineInput = z.object({ orderId: uuid, scope: z.enum(["ART", "APPROVAL", "PRODUCTION", "FINISHING", "INSTALLATION"]), dueDate: z.iso.date(), completedAt: z.string().nullable().optional() });
export const itemInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).nullable().optional(),
  quantity: z.coerce.number().positive().max(100000),
  width_cm: z.coerce.number().positive().max(100000).nullable().optional(),
  height_cm: z.coerce.number().positive().max(100000).nullable().optional(),
  unit: z.string().trim().min(1).max(30),
  notes: z.string().trim().max(4000).nullable().optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "READY", "CANCELLED"]),
  sort_order: z.coerce.number().int().min(0),
});
const commentInput = z.object({ orderId: uuid, message: z.string().trim().min(1).max(4000) });

const throwIfError = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};
const profileToUser = (profile: unknown, id: string): UserOption | undefined => {
  const row = Array.isArray(profile) ? profile[0] : profile;
  if (!row || typeof row !== "object") return undefined;
  const email = "email" in row && typeof row.email === "string" ? row.email : null;
  return { id, email, name: email ?? "Usuário" };
};

export async function getOrderDetail(orderId: string): Promise<OrderDetail> {
  uuid.parse(orderId);
  const [orderResult, assigneesResult, deadlinesResult] = await Promise.all([
    supabase.from("os_orders").select(ORDER_DETAIL_SELECT).eq("id", orderId).single(),
    supabase.from("os_order_assignees").select("id,order_id,user_id,scope,created_at,created_by,updated_at,profiles!os_order_assignees_user_id_fkey(email)").eq("order_id", orderId).order("scope"),
    supabase.from("os_order_deadlines").select("id,order_id,scope,due_date,completed_at,created_at,updated_at").eq("order_id", orderId).order("due_date"),
  ]);
  throwIfError(orderResult.error); throwIfError(assigneesResult.error); throwIfError(deadlinesResult.error);
  const assignees = (assigneesResult.data ?? []).map(row => ({ ...row, user: profileToUser(row.profiles, row.user_id) })) as unknown as OrderAssignee[];
  return { order: orderResult.data as unknown as OsOrder, assignees, deadlines: (deadlinesResult.data ?? []) as OrderDeadline[] };
}

export async function listAssignableUsers(limit = 50): Promise<UserOption[]> {
  const { data, error } = await supabase.from("profiles").select("id,email").order("email").limit(Math.min(100, Math.max(1, limit)));
  throwIfError(error);
  return (data ?? []).map(profile => ({ id: profile.id, email: profile.email, name: profile.email ?? "Usuário" }));
}

export async function setOrderAssignee(orderId: string, scope: AssigneeScope, userId: string) {
  const input = assigneeInput.parse({ orderId, scope, userId });
  const { data, error } = await supabase.from("os_order_assignees").upsert({ order_id: input.orderId, scope: input.scope, user_id: input.userId }, { onConflict: "order_id,scope" }).select("id,order_id,user_id,scope,created_at,created_by,updated_at").single();
  throwIfError(error); return data as OrderAssignee;
}

export async function upsertOrderDeadline(orderId: string, scope: DeadlineScope, dueDate: string, completedAt?: string | null) {
  const input = deadlineInput.parse({ orderId, scope, dueDate, completedAt });
  const { data, error } = await supabase.from("os_order_deadlines").upsert({ order_id: input.orderId, scope: input.scope, due_date: input.dueDate, completed_at: input.completedAt ?? null }, { onConflict: "order_id,scope" }).select().single();
  throwIfError(error); return data as OrderDeadline;
}

export async function listOrderItems(orderId: string) {
  uuid.parse(orderId);
  const { data, error } = await supabase.from("os_order_items").select("id,order_id,name,description,quantity,width_cm,height_cm,unit,notes,status,sort_order,created_at,updated_at,created_by,deleted_at").eq("order_id", orderId).is("deleted_at", null).order("sort_order");
  throwIfError(error); return (data ?? []) as OrderItem[];
}
export async function createOrderItem(orderId: string, input: z.input<typeof itemInputSchema>) {
  uuid.parse(orderId); const value = itemInputSchema.parse(input);
  const { data, error } = await supabase.from("os_order_items").insert({ order_id: orderId, ...value }).select().single();
  throwIfError(error); return data as OrderItem;
}
export async function updateOrderItem(id: string, input: Partial<z.input<typeof itemInputSchema>>) {
  uuid.parse(id); const value = itemInputSchema.partial().parse(input);
  const { data, error } = await supabase.from("os_order_items").update(value).eq("id", id).select().single();
  throwIfError(error); return data as OrderItem;
}
export async function removeOrderItem(id: string) {
  uuid.parse(id); const { error } = await supabase.from("os_order_items").update({ deleted_at: new Date().toISOString() }).eq("id", id); throwIfError(error);
}
export async function reorderOrderItems(items: Pick<OrderItem, "id" | "sort_order">[]) {
  await Promise.all(items.map(item => updateOrderItem(item.id, { sort_order: item.sort_order })));
}

export async function listOrderComments(orderId: string) {
  uuid.parse(orderId);
  const { data, error } = await supabase.from("os_order_comments").select("id,order_id,user_id,message,created_at,updated_at,deleted_at,profiles!os_order_comments_user_id_fkey(email)").eq("order_id", orderId).is("deleted_at", null).order("created_at", { ascending: false });
  throwIfError(error);
  return (data ?? []).map(row => ({ ...row, user: profileToUser(row.profiles, row.user_id) })) as unknown as OrderComment[];
}
export async function createOrderComment(orderId: string, message: string) {
  const input = commentInput.parse({ orderId, message });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sessão necessária para comentar.");
  const { data, error } = await supabase.from("os_order_comments").insert({ order_id: input.orderId, user_id: auth.user.id, message: input.message }).select().single();
  throwIfError(error); return data as OrderComment;
}
export async function updateOrderComment(id: string, message: string) {
  uuid.parse(id); const value = z.string().trim().min(1).max(4000).parse(message);
  const { data, error } = await supabase.from("os_order_comments").update({ message: value }).eq("id", id).select().single(); throwIfError(error); return data as OrderComment;
}
export async function removeOrderComment(id: string) {
  uuid.parse(id); const { error } = await supabase.from("os_order_comments").update({ deleted_at: new Date().toISOString() }).eq("id", id); throwIfError(error);
}

export async function listOrderActivities(orderId: string) {
  uuid.parse(orderId);
  const { data, error } = await supabase.from("os_orders_event").select("id,os_id,type,payload,created_by,created_at").eq("os_id", orderId).order("created_at", { ascending: false }).limit(100);
  throwIfError(error);
  const activities = (data ?? []) as OrderActivity[];
  const userIds = Array.from(new Set(activities.map(activity => activity.created_by).filter((id): id is string => Boolean(id))));
  if (!userIds.length) return activities;
  const { data: names, error: namesError } = await supabase.rpc("get_user_display_names", { user_ids: userIds });
  throwIfError(namesError);
  const users = new Map(((names ?? []) as { id: string; full_name: string | null; email: string | null }[]).map(profile => [profile.id, { id: profile.id, name: profile.full_name || profile.email || "Usuário", email: profile.email }]));
  return activities.map(activity => ({ ...activity, actor: activity.created_by ? users.get(activity.created_by) : undefined }));
}
export async function recordOrderEvent(input: { orderId: string; type: string; payload?: Record<string, unknown> }) {
  uuid.parse(input.orderId); z.string().min(1).max(80).parse(input.type);
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("os_orders_event").insert({ os_id: input.orderId, type: input.type, payload: input.payload ?? {}, created_by: auth.user?.id ?? null }); throwIfError(error);
}
export async function listOrderFiles(orderId: string) {
  uuid.parse(orderId);
  const { data, error } = await supabase.from("os_order_assets").select(ORDER_ASSET_SELECT).eq("os_id", orderId).is("deleted_from_storage_at", null).order("uploaded_at", { ascending: false });
  throwIfError(error); return (data ?? []) as OsOrderLayoutAsset[];
}
export async function updateOrderOperationalFields(orderId: string, input: { title?: string | null; description?: string | null; delivery_date?: string | null; logistic_type?: OsOrder["logistic_type"]; address?: string | null; art_direction_tag?: OsOrder["art_direction_tag"] }) {
  uuid.parse(orderId);
  const { data, error } = await supabase.from("os_orders").update(input).eq("id", orderId).select(ORDER_DETAIL_SELECT).single(); throwIfError(error); return data as unknown as OsOrder;
}
