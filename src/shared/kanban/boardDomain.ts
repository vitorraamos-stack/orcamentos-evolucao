import type { ArtStatus, ProdStatus } from "@/features/hubos/types";
import { isOrderOverdue } from "@/modules/orders/risk";
import type { BoardCardModel, BoardFiltersState, BoardStatus } from "./types";

export const ART_BOARD_COLUMNS: ArtStatus[] = [
  "Caixa de Entrada",
  "Em Criação",
  "Para Aprovação",
  "Ajustes",
  "Produzir",
];
export const PRODUCTION_BOARD_COLUMNS: ProdStatus[] = [
  "Produção",
  "Em Acabamento",
  "Pronto / Avisar Cliente",
  "Logística (Entrega/Transportadora)",
  "Instalação Agendada",
  "Finalizados",
];

export function cardStatus(
  card: BoardCardModel,
  board: "art" | "production"
): BoardStatus {
  return board === "art"
    ? card.order.art_status
    : (card.order.prod_status ?? "Produção");
}

export function sortBoardCards(cards: BoardCardModel[]) {
  const risk = { CRITICO: 0, ATENCAO: 1, NORMAL: 2 } as const;
  return [...cards].sort((a, b) => {
    const byRisk = risk[a.risk] - risk[b.risk];
    if (byRisk) return byRisk;
    const urgent =
      Number(b.order.art_direction_tag === "URGENTE") -
      Number(a.order.art_direction_tag === "URGENTE");
    if (urgent) return urgent;
    const due = (a.order.delivery_date ?? "9999-12-31").localeCompare(
      b.order.delivery_date ?? "9999-12-31"
    );
    return due || a.order.created_at.localeCompare(b.order.created_at);
  });
}

export function groupBoardCards(
  cards: BoardCardModel[],
  board: "art" | "production",
  columns: BoardStatus[]
) {
  const grouped = new Map(
    columns.map(column => [column, [] as BoardCardModel[]])
  );
  sortBoardCards(cards).forEach(card =>
    grouped.get(cardStatus(card, board))?.push(card)
  );
  return grouped;
}

export function filterBoardCards(
  cards: BoardCardModel[],
  filters: BoardFiltersState,
  userId?: string | null
) {
  const term = filters.search.trim().toLocaleLowerCase("pt-BR");
  return cards.filter(card => {
    const order = card.order;
    const searchable =
      `${order.os_number ?? ""} ${order.sale_number} ${order.client_name} ${order.title ?? ""}`.toLocaleLowerCase(
        "pt-BR"
      );
    return (
      (!term || searchable.includes(term)) &&
      (!filters.mine || card.assignee?.userId === userId) &&
      (!filters.overdue || isOrderOverdue(order)) &&
      (!filters.urgent || order.art_direction_tag === "URGENTE") &&
      (filters.assigneeId === "all" ||
        card.assignee?.userId === filters.assigneeId) &&
      (filters.artTag === "all" ||
        order.art_direction_tag === filters.artTag) &&
      (!filters.awaitingSupplies ||
        order.production_tag === "AGUARDANDO_INSUMOS") &&
      (!filters.external || order.production_tag === "PRODUCAO_EXTERNA") &&
      (!filters.reproducao || order.reproducao) &&
      (!filters.letraCaixa || order.letra_caixa)
    );
  });
}

export function applyArtworkPreset(cards: BoardCardModel[], preset: string) {
  if (preset === "approvals")
    return cards.filter(card => card.order.art_status === "Para Aprovação");
  if (preset === "revisions")
    return cards.filter(card => card.order.art_status === "Ajustes");
  return cards;
}

export function applyProductionPreset(cards: BoardCardModel[], preset: string) {
  if (preset === "printing")
    return cards.filter(
      card => card.order.prod_status === "Produção" && card.order.reproducao
    );
  if (preset === "finishing")
    return cards.filter(card => card.order.prod_status === "Em Acabamento");
  if (preset === "lettering")
    return cards.filter(card => card.order.letra_caixa);
  if (preset === "external")
    return cards.filter(
      card => card.order.production_tag === "PRODUCAO_EXTERNA"
    );
  if (preset === "ready")
    return cards.filter(
      card => card.order.prod_status === "Pronto / Avisar Cliente"
    );
  return cards;
}
