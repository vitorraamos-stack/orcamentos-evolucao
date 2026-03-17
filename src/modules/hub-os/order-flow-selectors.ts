import type { Os } from "./types";
import type { KioskBoardCard } from "./kiosk/types";
import { buildHubOrderFlowKeyFromOsId } from "./order-flow-key";

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
  cards.filter(
    card =>
      !isRetirado(card.order_key) && !isUpstreamFinalized(card.upstream_status)
  );
