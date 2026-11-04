import { useState } from "react";
import type { OrderActivity } from "../types/orderDetail";
import { dayKey, filterHistory, type HistoryFilter } from "../presentation/historyView";
import { Button } from "@/components/ui/button";
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
const auditText = (value: unknown): string | null => {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

const scopeLabels: Record<string, string> = {
  ART: "Arte",
  APPROVAL: "Aprovação",
  PRODUCTION: "Produção",
  FINISHING: "Acabamento",
  INSTALLATION: "Instalação",
  GENERAL: "Responsável geral",
};
export const scopeLabel = (value: unknown) => {
  const text = auditText(value);
  return text && Object.prototype.hasOwnProperty.call(scopeLabels, text)
    ? scopeLabels[text]
    : text ?? "Não informado";
};
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
    const status = auditText(activity.payload.to_status);
    if (status === "IN_PROGRESS") return `${center} iniciada ou retomada.`;
    if (status === "COMPLETED") return `${center} concluída.`;
    if (status === "BLOCKED") {
      const reason = auditText(activity.payload.blocked_reason);
      return reason ? `${center} bloqueada: ${reason}` : `${center} bloqueada.`;
    }
    return `${center} voltou para pendente.`;
  }
  if (activity.type === "assignee_changed")
    return to == null
      ? `Responsável de ${scopeLabel(scope)} removido`
      : `Responsável de ${scopeLabel(scope)} alterado`;
  if (activity.type.startsWith("deadline_"))
    return `Prazo de ${scopeLabel(scope)} ${activity.type.replace("deadline_", "").replace("completed", "concluído").replace("reopened", "reaberto").replace("removed", "removido").replace("changed", "alterado")}`;
  if (activity.type === "status_change" || activity.type === "status_changed") {
    const previous = auditText(from);
    const next = auditText(to);
    if (previous && next) return `OS movida de ${previous} para ${next}`;
    if (next) return `OS movida para ${next}`;
    return "Etapa da OS alterada";
  }
  if (activity.type === "returned_to_art") return "OS retornada para Arte";
  if (activity.type === "production_tag_changed")
    return `Tag de Produção alterada: ${auditText(from) ?? "—"} → ${auditText(to) ?? "—"}`;
  const knownLabel = Object.prototype.hasOwnProperty.call(labels, activity.type)
    ? labels[activity.type]
    : null;
  return (
    knownLabel ??
    ([auditText(name), auditText(from) && `${auditText(from)} → ${auditText(to) ?? "—"}`, auditText(due_date)]
      .filter(Boolean)
      .join(" · ") ||
      "Atividade da OS")
  );
}
export function OrderHistoryTab({
  activities,
  loading,
  error,
  onRetry, hasMore = false, onLoadMore, loadingMore = false,
}: {
  activities: OrderActivity[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  hasMore?: boolean; onLoadMore?: () => void; loadingMore?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const filtered = filterHistory(activities, search, filter, formatOrderActivity);
  if (loading) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Carregando histórico…
      </p>
    );
  }
  if (error) return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-4">
      <p className="min-w-0 break-words text-sm text-destructive">Não foi possível carregar o histórico: {error}</p>
      {onRetry && <Button type="button" variant="outline" onClick={onRetry}>Tentar novamente</Button>}
    </div>
  );
  if (!activities.length) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nenhum evento registrado.
      </p>
    );
  }

  return (
    <div className="space-y-3">
    {hasMore && (
      <p role="note" className="text-xs text-muted-foreground">
        Há registros anteriores disponíveis para carregar.
      </p>
    )}
    <div className="flex flex-wrap gap-2"><input type="search" aria-label="Pesquisar histórico" className="min-h-11 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" placeholder="Pesquisar acontecimentos" value={search} onChange={event => setSearch(event.target.value)} /><select aria-label="Filtrar histórico" className="min-h-11 rounded-md border bg-background px-3 text-sm" value={filter} onChange={event => setFilter(event.target.value as HistoryFilter)}><option value="all">Todos</option><option value="stages">Etapas</option><option value="updates">Alterações</option></select></div>
    {!filtered.length && <p role="status" className="text-sm text-muted-foreground">Nenhum evento corresponde aos filtros.</p>}
    <ol aria-label="Linha do tempo da OS" className="relative ml-2 space-y-3 border-l border-border pl-6">
      {filtered.map((activity, index) => (
        <li key={activity.id} className="relative min-w-0 rounded-xl border bg-card p-4">
          {(index === 0 || dayKey(filtered[index - 1].created_at) !== dayKey(activity.created_at)) && <h3 className="mb-3 border-b pb-2 text-xs font-semibold text-muted-foreground">{dayKey(activity.created_at) ?? "Data não identificada"}</h3>}
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
              Registrado por <span className="font-medium text-foreground">{activity.actor?.name?.trim() || (activity.created_by ? "Usuário não identificado" : "Sistema")}</span>
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-relaxed [overflow-wrap:anywhere]">
            {formatOrderActivity(activity)}
          </p>
        </li>
      ))}
    </ol>
    {hasMore && onLoadMore && <Button type="button" variant="outline" className="min-h-11 w-full" disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? "Carregando…" : "Carregar registros anteriores"}</Button>}
    </div>
  );
}
