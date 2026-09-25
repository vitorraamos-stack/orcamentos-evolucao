import { isOrderOverdue } from "@/modules/orders/risk";
import type { BoardCardModel, BoardKind } from "./types";

export type BoardMetric = { label: string; count: number };

/** Metrics always use the complete repository result, before route presets/filters. */
export function calculateBoardMetrics(
  cards: BoardCardModel[],
  board: BoardKind
): BoardMetric[] {
  if (board === "art")
    return [
      metric(
        "Em Criação",
        cards,
        card => card.order.art_status === "Em Criação"
      ),
      metric(
        "Para Aprovação",
        cards,
        card => card.order.art_status === "Para Aprovação"
      ),
      metric("Ajustes", cards, card => card.order.art_status === "Ajustes"),
      metric(
        "Urgentes",
        cards,
        card => card.order.art_direction_tag === "URGENTE"
      ),
      metric("Atrasadas", cards, card => isOrderOverdue(card.order)),
    ];
  return [
    metric("Produção", cards, card => card.order.prod_status === "Produção"),
    metric(
      "Acabamento",
      cards,
      card => card.order.prod_status === "Em Acabamento"
    ),
    metric(
      "Aguardando insumos",
      cards,
      card => card.order.production_tag === "AGUARDANDO_INSUMOS"
    ),
    metric(
      "Prontos",
      cards,
      card => card.order.prod_status === "Pronto / Avisar Cliente"
    ),
    metric("Atrasadas", cards, card => isOrderOverdue(card.order)),
  ];
}

function metric(
  label: string,
  cards: BoardCardModel[],
  predicate: (card: BoardCardModel) => boolean
): BoardMetric {
  return { label, count: cards.filter(predicate).length };
}
