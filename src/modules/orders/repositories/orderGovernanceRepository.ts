import { supabase } from "@/lib/supabase";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";

export type OrderDeletionBlocker = { code: "FINANCE_SETTLED" | "PAYMENT_PROOF_RETENTION"; message: string };
export type OrderDeletionCounts = Record<string, number>;
export type OrderDeletionPreview = { order: { id: string; display_number: string; sale_number: string | null; os_number: number | null; client_name: string; prod_status: string | null; art_status: string | null; archived: boolean }; allowed: boolean; blockers: OrderDeletionBlocker[]; counts: OrderDeletionCounts; r2_object_count: number; expected_confirmation: string };
export type OrderDeletionResult = { audit_id: string; os_id: string; display_number: string; sale_number: string | null; client_name: string; counts: OrderDeletionCounts; r2_keys: string[]; r2_cleanup_status: "PENDING" | "NOT_REQUIRED" };
export type OrderDeletionStorageCleanupResult = { deleted: number; errors: unknown[]; storageDeleteSucceeded?: boolean; auditUpdateSucceeded?: boolean };

const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };
export async function getOrderDeletionPreview(orderId: string) { const { data,error } = await supabase.rpc("hub_os_delete_order_preview_secure", { p_os_id: orderId }); fail(error); return data as OrderDeletionPreview; }
export async function archiveOrderSecure(input: { id: string; reason: string; actorName?: string | null }) { const { data,error } = await supabase.rpc("hub_os_archive_order_secure", { p_os_id: input.id, p_reason: input.reason.trim(), p_payload: { origin: "order_detail", ...(input.actorName ? { actor_name: input.actorName } : {}) } }); fail(error); return data; }
export async function deleteOrderPermanently(input: { id: string; reason: string; confirmation: string; actorName?: string | null }) { const { data,error } = await supabase.rpc("hub_os_delete_order_secure_v2", { p_os_id: input.id, p_reason: input.reason.trim(), p_confirmation: input.confirmation.trim(), p_payload: { origin: "order_detail", ...(input.actorName ? { actor_name: input.actorName } : {}) } }); fail(error); return data as OrderDeletionResult; }
export function cleanupDeletedOrderStorage(result: OrderDeletionResult) { return invokeEdgeFunction<OrderDeletionStorageCleanupResult>(supabase, "r2-delete-objects", { keys: result.r2_keys, deletionAuditId: result.audit_id }); }
