import type { OrderActivity } from "../types/orderDetail";
import {
  WORK_CENTER_LABELS,
  type WorkCenter,
} from "@/modules/production/operations";
const labels: Record<string, string> = {
  INSTALLATION_SCHEDULED: "Instalação agendada",
  INSTALLATION_RESCHEDULED: "Instalação reagendada",
  INSTALLATION_STARTED: "Instalação iniciada",
  INSTALLATION_COMPLETED: "Instalação concluída",
  INSTALLATION_CANCELLED: "Instalação cancelada",
  DELIVERY_SCHEDULED: "Entrega agendada",
  DELIVERY_STARTED: "Entrega em trânsito",
  DELIVERY_COMPLETED: "Entrega concluída",
  DELIVERY_CANCELLED: "Entrega cancelada",
  deadline_changed: "Prazo alterado",
  deadline_completed: "Prazo concluído",
  deadline_reopened: "Prazo reaberto",
  deadline_removed: "Prazo removido",
  item_created: "Item criado",
  item_updated: "Item alterado",
  item_removed: "Item removido",
  comment_created: "Comentário adicionado",
  comment_updated: "Comentário alterado",
  comment_removed: "Comentário removido",
  status_change: "Etapa alterada",
  status_changed: "Etapa alterada",
  returned_to_art: "OS retornada para Arte",
  production_tag_changed: "Tag de Produção alterada",
  details_updated: "OS atualizada",
  order_archived: "OS arquivada",
};
export const scopeLabel = (value: unknown) =>
  ({
    ART: "Arte",
    APPROVAL: "Aprovação",
    PRODUCTION: "Produção",
    FINISHING: "Acabamento",
    INSTALLATION: "Instalação",
    GENERAL: "Responsável geral",
  })[String(value)] ?? String(value ?? "");
export function formatOrderActivity(
  activity: Pick<OrderActivity, "type" | "payload">
) {
  const { scope, from, to, name, due_date } = activity.payload;
  if (activity.type.startsWith("ITEM_OPERATION_")) {
    const center =
      WORK_CENTER_LABELS[activity.payload.work_center as WorkCenter] ??
      "Operação";
    if (activity.type === "ITEM_OPERATION_CREATED")
      return `${center} adicionada ao item.`;
    if (activity.type === "ITEM_OPERATION_DELETED")
      return `${center} removida do item.`;
    if (activity.type === "ITEM_OPERATION_UPDATED")
      return `${center} atualizada.`;
    const status = String(activity.payload.to_status);
    if (status === "IN_PROGRESS") return `${center} iniciada ou retomada.`;
    if (status === "COMPLETED") return `${center} concluída.`;
    if (status === "BLOCKED")
      return `${center} bloqueada: ${String(activity.payload.blocked_reason)}`;
    return `${center} voltou para pendente.`;
  }
  if (activity.type === "assignee_changed")
    return to == null
      ? `Responsável de ${scopeLabel(scope)} removido`
      : `Responsável de ${scopeLabel(scope)} alterado`;
  if (activity.type.startsWith("deadline_"))
    return `Prazo de ${scopeLabel(scope)} ${activity.type.replace("deadline_", "").replace("completed", "concluído").replace("reopened", "reaberto").replace("removed", "removido").replace("changed", "alterado")}`;
  if (activity.type === "status_change" || activity.type === "status_changed")
    return `OS movida de ${String(from)} para ${String(to)}`;
  if (activity.type === "returned_to_art") return "OS retornada para Arte";
  if (activity.type === "production_tag_changed")
    return `Tag de Produção alterada: ${String(from ?? "—")} → ${String(to ?? "—")}`;
  return (
    labels[activity.type] ??
    ([name, from && `${String(from)} → ${String(to ?? "—")}`, due_date]
      .filter(Boolean)
      .join(" · ") ||
      "Atividade da OS")
  );
}
export function OrderHistoryTab({
  activities,
  loading,
  error,
}: {
  activities: OrderActivity[];
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Carregando histórico…
      </p>
    );
  }
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!activities.length) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nenhum evento registrado.
      </p>
    );
  }

  return (
    <ol aria-label="Linha do tempo da OS" className="relative ml-2 space-y-3 border-l border-border pl-6">
      {activities.map(activity => (
        <li key={activity.id} className="relative min-w-0 rounded-xl border bg-card p-4">
          <span
            aria-hidden="true"
            className="absolute -left-[31px] top-5 size-3 rounded-full border-2 border-background bg-primary"
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <time dateTime={activity.created_at}>
              {new Date(activity.created_at).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })}
            </time>
            <span className="break-words">
              Registrado por <span className="font-medium text-foreground">{activity.actor?.name ?? "Sistema"}</span>
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-relaxed [overflow-wrap:anywhere]">
            {formatOrderActivity(activity)}
          </p>
        </li>
      ))}
    </ol>
  );
}
