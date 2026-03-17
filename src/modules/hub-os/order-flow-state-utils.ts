import type { HubOrderFlowRow } from "./order-flow-api";

type OrderFlowMap = Record<string, HubOrderFlowRow>;

export const toOrderFlowMap = (rows: HubOrderFlowRow[]) => {
  const next: OrderFlowMap = {};
  rows.forEach(row => {
    next[row.order_key] = row;
  });
  return next;
};

export const upsertOrderFlowRow = (
  map: OrderFlowMap,
  row: HubOrderFlowRow
) => ({
  ...map,
  [row.order_key]: row,
});

export const removeOrderFlowRow = (map: OrderFlowMap, orderKey: string) => {
  const next = { ...map };
  delete next[orderKey];
  return next;
};
