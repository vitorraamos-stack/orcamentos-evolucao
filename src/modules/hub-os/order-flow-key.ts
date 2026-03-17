export type HubOrderFlowSourceType = "os" | "os_orders";

export type HubOrderFlowIdentity = {
  sourceType: HubOrderFlowSourceType;
  sourceId: string;
};

export const buildHubOrderFlowKey = ({
  sourceType,
  sourceId,
}: HubOrderFlowIdentity) => `${sourceType}:${sourceId}`;

export const parseHubOrderFlowKey = (
  orderKey: string
): HubOrderFlowIdentity | null => {
  const [sourceType, sourceId, ...rest] = String(orderKey ?? "").split(":");
  if (rest.length > 0) return null;
  if (!sourceId) return null;
  if (sourceType !== "os" && sourceType !== "os_orders") return null;

  return { sourceType, sourceId };
};

export const buildHubOrderFlowKeyFromOsId = (sourceId: string) =>
  buildHubOrderFlowKey({ sourceType: "os", sourceId });

export const buildHubOrderFlowKeyFromOsOrdersId = (sourceId: string) =>
  buildHubOrderFlowKey({ sourceType: "os_orders", sourceId });
