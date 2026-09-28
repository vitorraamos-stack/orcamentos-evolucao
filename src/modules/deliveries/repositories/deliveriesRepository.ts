import { supabase } from "@/lib/supabase";
import { listOrderFlowState } from "@/modules/hub-os/order-flow-api";
import type { LogisticsOrder } from "@/modules/installations/types";
import type { Delivery, DeliveryInput } from "../types";
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
export async function loadDeliveryWorkspace() {
  const [deliveries, orders, flow] = await Promise.all([
    supabase
      .from("os_deliveries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("os_orders")
      .select(
        "id,sale_number,client_name,delivery_date,address,address_lat,address_lng,logistic_type,prod_status,archived,updated_at"
      )
      .in("logistic_type", ["entrega", "retirada"])
      .eq("archived", false)
      .limit(250),
    listOrderFlowState(),
  ]);
  fail(deliveries.error);
  fail(orders.error);
  const map = new Map((orders.data ?? []).map(o => [o.id, o]));
  return {
    deliveries: (deliveries.data ?? []).map(d => ({
      ...d,
      order: map.get(d.os_id) ?? null,
    })) as Delivery[],
    orders: (orders.data ?? []) as LogisticsOrder[],
    flow,
  };
}
export async function scheduleDelivery(i: DeliveryInput) {
  const { error } = await supabase.rpc("hub_os_schedule_delivery_secure", {
    p_os_id: i.osId,
    p_mode: i.mode,
    p_scheduled_at: i.scheduledAt ?? null,
    p_assigned_to: i.assignedTo ?? null,
    p_vehicle_label: i.vehicleLabel ?? null,
    p_carrier_name: i.carrierName ?? null,
    p_tracking_code: i.trackingCode ?? null,
    p_notes: i.notes ?? null,
  });
  fail(error);
}
export async function deliveryAction(
  action: "start" | "complete" | "cancel",
  id: string,
  extra?: string
) {
  const rpc = {
    start: "hub_os_start_delivery_secure",
    complete: "hub_os_complete_delivery_secure",
    cancel: "hub_os_cancel_delivery_secure",
  } as const;
  const args =
    action === "cancel"
      ? { p_delivery_id: id, p_cancelled_reason: extra }
      : action === "complete"
        ? { p_delivery_id: id, p_recipient_name: extra || null }
        : { p_delivery_id: id, p_carrier_name: null, p_tracking_code: null };
  const { error } = await supabase.rpc(rpc[action], args);
  fail(error);
}
