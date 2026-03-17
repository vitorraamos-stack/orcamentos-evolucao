import type { Os } from "./types";
import type { KioskBoardCard } from "./kiosk/types";
import {
  buildHubOrderFlowKey,
  buildHubOrderFlowKeyFromOsId,
  parseHubOrderFlowKey,
} from "./order-flow-key";

export const filterHubReadyToNotifyOrders = (
  orders: Os[],
  isRetirado: (orderKey: string) => boolean
) =>
  orders.filter(order => !isRetirado(buildHubOrderFlowKeyFromOsId(order.id)));

export const filterKioskActiveCards = (
  cards: KioskBoardCard[],
  isRetirado: (orderKey: string) => boolean,
  isUpstreamFinalized: (upstreamStatus: string | null) => boolean
) =>
  cards.filter(card => {
    const candidateKeys = new Set<string>();
    const rawOrderKey = String(card.order_key ?? "").trim();

    if (rawOrderKey) {
      candidateKeys.add(rawOrderKey);
    }

    if (card.source_type && card.source_id) {
      candidateKeys.add(
        buildHubOrderFlowKey({
          sourceType: card.source_type,
          sourceId: card.source_id,
        })
      );
    }

    if (rawOrderKey && !parseHubOrderFlowKey(rawOrderKey) && card.source_id) {
      // Compatibilidade com estado legado gravado antes da chave canônica.
      candidateKeys.add(card.source_id);
    }

    const retirado = Array.from(candidateKeys).some(orderKey =>
      isRetirado(orderKey)
    );
    return !retirado && !isUpstreamFinalized(card.upstream_status);
  });
