import type { OrderActivity } from "../types/orderDetail";
const labels: Record<string, string> = { assignee_changed: "Responsável alterado", deadline_changed: "Prazo alterado", item_created: "Item criado", item_updated: "Item alterado", item_removed: "Item removido", comment_created: "Comentário adicionado", comment_updated: "Comentário alterado", comment_removed: "Comentário removido", status_changed: "Status alterado", details_updated: "OS atualizada", order_archived: "OS arquivada" };
const detail = (activity: OrderActivity) => { const { scope, from, to, name, due_date } = activity.payload; return [scope, name, from && `${String(from)} → ${String(to ?? "—")}`, due_date].filter(Boolean).join(" · "); };
export function OrderHistoryTab({ activities, loading, error }: { activities: OrderActivity[]; loading: boolean; error: string | null }) {
  if (loading) return <p className="text-sm text-muted-foreground">Carregando histórico…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!activities.length) return <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum evento registrado.</p>;
  return <ol className="relative ml-2 border-l">{activities.map(activity => <li key={activity.id} className="mb-6 ml-5"><span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary" /><time className="text-xs text-muted-foreground">{new Date(activity.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</time><p className="font-medium">{labels[activity.type] ?? "Atividade da OS"}</p><p className="text-xs text-muted-foreground">{activity.actor?.name ?? "Sistema"}</p>{detail(activity) && <p className="text-sm text-muted-foreground">{detail(activity)}</p>}</li>)}</ol>;
}
