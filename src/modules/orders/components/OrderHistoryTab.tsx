import type { OrderActivity } from "../types/orderDetail";
const labels: Record<string, string> = {
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
  if (loading)
    return (
      <p className="text-sm text-muted-foreground">Carregando histórico…</p>
    );
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!activities.length)
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nenhum evento registrado.
      </p>
    );
  return (
    <ol className="relative ml-2 border-l">
      {activities.map(activity => (
        <li key={activity.id} className="mb-6 ml-5">
          <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary" />
          <time className="text-xs text-muted-foreground">
            {new Date(activity.created_at).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })}
          </time>
          <p className="font-medium">{formatOrderActivity(activity)}</p>
          <p className="text-xs text-muted-foreground">
            {activity.actor?.name ?? "Sistema"}
          </p>
        </li>
      ))}
    </ol>
  );
}
