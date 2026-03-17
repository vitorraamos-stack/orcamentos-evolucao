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
) => {
  const current = map[row.order_key];
  if (!current) {
    return {
      ...map,
      [row.order_key]: row,
    };
  }

  const currentUpdatedAt = Date.parse(current.updated_at);
  const nextUpdatedAt = Date.parse(row.updated_at);
  if (
    Number.isFinite(currentUpdatedAt) &&
    Number.isFinite(nextUpdatedAt) &&
    nextUpdatedAt < currentUpdatedAt
  ) {
    return map;
  }

  return {
    ...map,
    [row.order_key]: row,
  };
};

export const removeOrderFlowRow = (map: OrderFlowMap, orderKey: string) => {
  const next = { ...map };
  delete next[orderKey];
  return next;
};
