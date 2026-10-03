import type { BoardCardModel, BoardFiltersState } from "@/shared/kanban/types";

export function countProductionAdvancedFilters(filters: BoardFiltersState) {
  return (
    Number(filters.assigneeId !== "all") +
    Number(filters.workCenter !== "all") +
    Number(filters.overdue) +
    Number(filters.awaitingSupplies) +
    Number(filters.external) +
    Number(filters.reproducao) +
    Number(filters.letraCaixa) +
    Number(filters.blockedOperations) +
    Number(filters.myOperations)
  );
}

export function formatBlockedOperations(count: number) {
  return count === 1
    ? "1 operação bloqueada"
    : `${count} operações bloqueadas`;
}

export function getProductionCardDeadline(card: BoardCardModel) {
  return (
    card.deadlines.find(deadline =>
      ["PRODUCTION", "FINISHING"].includes(deadline.scope)
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

export function formatProductionDeadline(
  value: string | null,
  now = new Date()
) {
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
