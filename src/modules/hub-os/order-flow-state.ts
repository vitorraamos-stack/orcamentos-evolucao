import { useCallback, useEffect, useMemo, useState } from "react";

const ORDER_FLOW_STORAGE_KEY = "hub_os_order_flow_state_v1";
const ORDER_FLOW_EVENT = "hub-os-order-flow-state-changed";

type PersistedOrderFlowState = {
  version: 1;
  avisadoIds: string[];
  retiradoIds: string[];
};

type PersistedOrderFlowStateLegacy = {
  avisadoIds?: unknown;
  retiradoIds?: unknown;
};

type OrderFlowState = {
  avisadoIds: string[];
  retiradoIds: string[];
};

const EMPTY_STATE: OrderFlowState = {
  avisadoIds: [],
  retiradoIds: [],
};

const toIdList = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const sanitizeState = (raw: unknown): OrderFlowState => {
  if (!raw || typeof raw !== "object") return EMPTY_STATE;

  const candidate = raw as
    | PersistedOrderFlowState
    | PersistedOrderFlowStateLegacy;
  return {
    avisadoIds: Array.from(new Set(toIdList(candidate.avisadoIds))),
    retiradoIds: Array.from(new Set(toIdList(candidate.retiradoIds))),
  };
};

const readState = (): OrderFlowState => {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(ORDER_FLOW_STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    return sanitizeState(JSON.parse(raw));
  } catch {
    return EMPTY_STATE;
  }
};

const writeState = (state: OrderFlowState) => {
  if (typeof window === "undefined") return;
  const persisted: PersistedOrderFlowState = {
    version: 1,
    avisadoIds: state.avisadoIds,
    retiradoIds: state.retiradoIds,
  };
  window.localStorage.setItem(
    ORDER_FLOW_STORAGE_KEY,
    JSON.stringify(persisted)
  );
  window.dispatchEvent(new CustomEvent(ORDER_FLOW_EVENT));
};

const toggleId = (ids: string[], id: string) =>
  ids.includes(id) ? ids.filter(existingId => existingId !== id) : [...ids, id];

export const isDeliveryRetirada = (deliveryMode: string | null | undefined) =>
  (deliveryMode ?? "").trim().toUpperCase() === "RETIRADA";

export const useGlobalOrderFlowState = () => {
  const [state, setState] = useState<OrderFlowState>(() => readState());

  useEffect(() => {
    const syncFromStorage = () => setState(readState());
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== ORDER_FLOW_STORAGE_KEY) return;
      syncFromStorage();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(ORDER_FLOW_EVENT, syncFromStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ORDER_FLOW_EVENT, syncFromStorage);
    };
  }, []);

  const updateState = useCallback(
    (updater: (prev: OrderFlowState) => OrderFlowState) => {
      setState(prev => {
        const next = updater(prev);
        writeState(next);
        return next;
      });
    },
    []
  );

  const isAvisado = useCallback(
    (orderKey: string) => state.avisadoIds.includes(orderKey),
    [state.avisadoIds]
  );

  const isRetirado = useCallback(
    (orderKey: string) => state.retiradoIds.includes(orderKey),
    [state.retiradoIds]
  );

  const toggleAvisado = useCallback(
    (orderKey: string) => {
      updateState(prev => ({
        ...prev,
        avisadoIds: toggleId(prev.avisadoIds, orderKey),
      }));
    },
    [updateState]
  );

  const markRetirado = useCallback(
    (orderKey: string) => {
      updateState(prev => ({
        retiradoIds: prev.retiradoIds.includes(orderKey)
          ? prev.retiradoIds
          : [...prev.retiradoIds, orderKey],
        avisadoIds: prev.avisadoIds.filter(
          existingId => existingId !== orderKey
        ),
      }));
    },
    [updateState]
  );

  return useMemo(
    () => ({
      avisadoIds: state.avisadoIds,
      retiradoIds: state.retiradoIds,
      isAvisado,
      isRetirado,
      toggleAvisado,
      markRetirado,
    }),
    [
      isAvisado,
      isRetirado,
      markRetirado,
      state.avisadoIds,
      state.retiradoIds,
      toggleAvisado,
    ]
  );
};
