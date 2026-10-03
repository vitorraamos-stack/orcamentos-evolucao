import { isOrderUrgent } from "@/features/hubos/orderUrgency";
import { isOrderOverdue } from "@/modules/orders/risk";
import type { BoardCardModel, BoardFiltersState } from "@/shared/kanban/types";

export function getArtworkCardDeadline(card: BoardCardModel) {
  return (
    card.deadlines.find(deadline =>
      ["ART", "APPROVAL"].includes(deadline.scope)
    )?.dueDate ??
    card.order.delivery_date ??
    null
  );
}

const dateKey = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

export function formatArtworkDeadline(value: string | null, now = new Date()) {
  if (!value) return "Sem prazo";
  const key = value.slice(0, 10);
  const today = dateKey(now);
  const tomorrow = dateKey(new Date(now.getTime() + 86_400_000));
  if (key === today) return "Hoje";
  if (key === tomorrow) return "Amanhã";
  if (key < today) {
    const days = Math.max(
      1,
      Math.round(
        (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${key}T12:00:00Z`)) /
          86_400_000
      )
    );
    return `Atrasado há ${days} dia${days === 1 ? "" : "s"}`;
  }
  const [year, month, day] = key.split("-");
  return `${day}/${month}/${year}`;
}

export function sortArtworkCards(cards: BoardCardModel[]) {
  return [...cards].sort((a, b) => {
    const overdue =
      Number(isOrderOverdue(b.order)) - Number(isOrderOverdue(a.order));
    if (overdue) return overdue;
    const urgent =
      Number(isOrderUrgent(b.order)) - Number(isOrderUrgent(a.order));
    if (urgent) return urgent;
    const due = (getArtworkCardDeadline(a) ?? "9999-12-31").localeCompare(
      getArtworkCardDeadline(b) ?? "9999-12-31"
    );
    return due || a.order.created_at.localeCompare(b.order.created_at);
  });
}

export function getArtworkQueuePositions(cards: BoardCardModel[]) {
  return new Map(
    sortArtworkCards(
      cards.filter(card => card.order.art_status === "Fila de Arte")
    ).map((card, index) => [card.order.id, index + 1])
  );
}

export function countArtworkAdvancedFilters(filters: BoardFiltersState) {
  return (
    Number(filters.assigneeId !== "all") +
    Number(filters.artTag !== "all") +
    Number(filters.urgent) +
    Number(filters.overdue)
  );
}
