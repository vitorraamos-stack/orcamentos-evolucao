import { Badge } from "@/components/ui/badge";
import {
  DELIVERY_MODE_LABEL, DELIVERY_STATUS_LABEL, pickupState,
} from "@/modules/deliveries/services/deliveries";
import { formatAgendaDate } from "@/modules/installations/services/installations";
import type { Delivery, DeliveryStatus } from "@/modules/deliveries/types";
import type { HubOrderFlowRow } from "@/modules/hub-os/order-flow-api";

const deliveryStyles: Record<DeliveryStatus, string> = {
  SCHEDULED: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
  IN_TRANSIT: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  CANCELLED: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
};

export type InstallationExecutionView = "none" | "loading" | "ready" | "error";
export function installationExecutionViewState(
  state: { installationId: string | null; status: "idle" | "loading" | "ready" | "error" },
  currentInstallationId: string | null,
): InstallationExecutionView {
  if (!currentInstallationId) return "none";
  // Never display stale checklists or an empty state for another installation.
  if (state.installationId !== currentInstallationId || state.status === "idle") return "loading";
  return state.status;
}

/** Read-only logistics summary; does not change any existing status transitions. */
export function OrderDeliverySummary({ delivery }: { delivery: Delivery }) {
  const transport = delivery.carrier_name || delivery.vehicle_label || "Responsável não informado";
  return (
    <section aria-label="Detalhes da entrega" className="space-y-4">
      <Badge variant="outline" className={`rounded-full ${deliveryStyles[delivery.status]}`}>
        {DELIVERY_STATUS_LABEL[delivery.status]}
      </Badge>
      <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-muted-foreground">Modalidade</dt>
          <dd className="mt-1 break-words font-medium">{DELIVERY_MODE_LABEL[delivery.mode]}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Agendamento</dt>
          <dd className="mt-1 break-words font-medium">
            {delivery.scheduled_at ? formatAgendaDate(delivery.scheduled_at) : "Sem horário"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Transporte</dt>
          <dd className="mt-1 break-words font-medium">{transport}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Rastreio</dt>
          <dd className="mt-1 break-words font-medium">{delivery.tracking_code || "Não informado"}</dd>
        </div>
        {delivery.recipient_name && (
          <div className="min-w-0">
            <dt className="text-muted-foreground">Destinatário</dt>
            <dd className="mt-1 break-words font-medium">{delivery.recipient_name}</dd>
          </div>
        )}
        {delivery.completed_at && (
          <div className="min-w-0">
            <dt className="text-muted-foreground">Entregue em</dt>
            <dd className="mt-1 break-words font-medium">{formatAgendaDate(delivery.completed_at)}</dd>
          </div>
        )}
        {delivery.cancelled_at && (
          <div className="min-w-0">
            <dt className="text-muted-foreground">Cancelada em</dt>
            <dd className="mt-1 break-words font-medium">{formatAgendaDate(delivery.cancelled_at)}</dd>
          </div>
        )}
        {delivery.cancelled_reason && (
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-muted-foreground">Motivo do cancelamento</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words">{delivery.cancelled_reason}</dd>
          </div>
        )}
        {delivery.notes && (
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-muted-foreground">Observações</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words">{delivery.notes}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

export function OrderPickupSummary({ pickup }: { pickup: HubOrderFlowRow | null }) {
  const state = pickupState(pickup ?? undefined);
  return (
    <section aria-label="Detalhes da retirada" className="space-y-4">
      <Badge variant="outline" className={state === "Retirado"
        ? "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
        : "rounded-full"}>
        {state}
      </Badge>
      <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-muted-foreground">Aviso ao cliente</dt>
          <dd className="mt-1 break-words font-medium">
            {pickup?.avisado_at ? formatAgendaDate(pickup.avisado_at) : "Pendente"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Retirada</dt>
          <dd className="mt-1 break-words font-medium">
            {pickup?.retirado_at ? formatAgendaDate(pickup.retirado_at) : "Pendente"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
