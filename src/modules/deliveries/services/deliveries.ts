import type { DeliveryMode, DeliveryStatus } from "../types";
import type { LogisticsOrder } from "@/modules/installations/types";
import type { HubOrderFlowRow } from "@/modules/hub-os/order-flow-api";
export const DELIVERY_MODE_LABEL: Record<DeliveryMode, string> = {
  OWN_DELIVERY: "Entrega própria",
  CARRIER: "Transportadora",
};
export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  SCHEDULED: "Agendada",
  IN_TRANSIT: "Em trânsito",
  COMPLETED: "Entregue",
  CANCELLED: "Cancelada",
};
export const isWaitingDelivery = (o: LogisticsOrder, active: Set<string>) =>
  o.logistic_type === "entrega" &&
  o.prod_status === "Pronto / Avisar Cliente" &&
  !o.archived &&
  !active.has(o.id);
export const isLegacyDelivery = (o: LogisticsOrder, active: Set<string>) =>
  o.logistic_type === "entrega" &&
  o.prod_status === "Logística (Entrega/Transportadora)" &&
  !active.has(o.id);
export function pickupState(flow?: HubOrderFlowRow) {
  if (flow?.retirado_at) return "Retirado";
  if (flow?.avisado_at) return "Cliente avisado";
  return "Aguardando aviso";
}
