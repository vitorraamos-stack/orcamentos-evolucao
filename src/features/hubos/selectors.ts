import type { OsOrder } from "./types";

export const isOrderInProntoAvisarColumn = (order: OsOrder) =>
  order.prod_status === "Pronto / Avisar Cliente";

export const selectProntoAvisarOrders = (
  orders: OsOrder[],
  isRetirado: (order: OsOrder) => boolean
) =>
  orders.filter(
    order => isOrderInProntoAvisarColumn(order) && !isRetirado(order)
  );
