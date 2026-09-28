import type { LogisticsOrder } from "@/modules/installations/types";
export type DeliveryMode = "OWN_DELIVERY" | "CARRIER";
export type DeliveryStatus =
  | "SCHEDULED"
  | "IN_TRANSIT"
  | "COMPLETED"
  | "CANCELLED";
export type Delivery = {
  id: string;
  os_id: string;
  mode: DeliveryMode;
  status: DeliveryStatus;
  scheduled_at: string | null;
  assigned_to: string | null;
  vehicle_label: string | null;
  carrier_name: string | null;
  tracking_code: string | null;
  recipient_name: string | null;
  notes: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  order?: LogisticsOrder | null;
};
export type DeliveryInput = {
  osId: string;
  mode: DeliveryMode;
  scheduledAt?: string | null;
  assignedTo?: string | null;
  vehicleLabel?: string | null;
  carrierName?: string | null;
  trackingCode?: string | null;
  notes?: string | null;
};
export type DeliveryUpdateInput = Omit<DeliveryInput, "osId" | "mode">;
