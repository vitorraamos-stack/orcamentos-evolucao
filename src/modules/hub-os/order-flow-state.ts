import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  getOrderFlowRealtimeTable,
  listOrderFlowState,
  markOrderFlowRetirado,
  setOrderFlowAvisado,
  type HubOrderFlowRow,
} from "./order-flow-api";
import {
  buildHubOrderFlowKey,
  type HubOrderFlowIdentity,
} from "./order-flow-key";
import {
  removeOrderFlowRow,
  toOrderFlowMap,
  upsertOrderFlowRow,
} from "./order-flow-state-utils";

type OrderFlowMap = Record<string, HubOrderFlowRow>;

const EMPTY_STATE: OrderFlowMap = {};

export const isDeliveryRetirada = (deliveryMode: string | null | undefined) =>
  (deliveryMode ?? "").trim().toUpperCase() === "RETIRADA";

export const useGlobalOrderFlowState = () => {
  const [state, setState] = useState<OrderFlowMap>(EMPTY_STATE);
  const refreshSeqRef = useRef(0);

  const refreshState = useCallback(async () => {
    const requestSeq = ++refreshSeqRef.current;
    const rows = await listOrderFlowState();
    if (requestSeq !== refreshSeqRef.current) return;

    setState(prev => {
      const merged = { ...prev };
      Object.entries(toOrderFlowMap(rows)).forEach(([key, row]) => {
        merged[key] = row;
      });
      return merged;
    });
  }, []);

  useEffect(() => {
    void refreshState().catch(error => {
      console.error(error);
    });

    let reconnectTimeout: number | null = null;
    let active = true;
    const scheduleRefresh = () => {
      if (!active) return;
      if (reconnectTimeout) {
        window.clearTimeout(reconnectTimeout);
      }
      reconnectTimeout = window.setTimeout(() => {
        void refreshState().catch(error => {
          console.error(error);
        });
      }, 1200);
    };

    const channel = supabase
      .channel("hub-os-order-flow-state")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: getOrderFlowRealtimeTable(),
        },
        payload => {
          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as { order_key?: string };
            const oldOrderKey = oldRow?.order_key;
            if (oldOrderKey) {
              setState(prev => removeOrderFlowRow(prev, oldOrderKey));
            }
            return;
          }

          const nextRow = payload.new as HubOrderFlowRow;
          if (!nextRow?.order_key) return;
          setState(prev => upsertOrderFlowRow(prev, nextRow));
        }
      )
      .subscribe(status => {
        if (
          status === "SUBSCRIBED" ||
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          scheduleRefresh();
        }
      });

    return () => {
      active = false;
      if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
      supabase.removeChannel(channel);
    };
  }, [refreshState]);

  const isAvisado = useCallback(
    (orderKey: string) => Boolean(state[orderKey]?.avisado_at),
    [state]
  );

  const isRetirado = useCallback(
    (orderKey: string) => Boolean(state[orderKey]?.retirado_at),
    [state]
  );

  const setAvisado = useCallback(
    async (identity: HubOrderFlowIdentity) => {
      const orderKey = buildHubOrderFlowKey(identity);
      const nextAvisado = !Boolean(state[orderKey]?.avisado_at);
      const row = await setOrderFlowAvisado(identity, nextAvisado);
      setState(prev => upsertOrderFlowRow(prev, row));
      return row;
    },
    [state]
  );

  const markRetirado = useCallback(async (identity: HubOrderFlowIdentity) => {
    const row = await markOrderFlowRetirado(identity);
    setState(prev => upsertOrderFlowRow(prev, row));
    return row;
  }, []);

  return useMemo(
    () => ({
      isAvisado,
      isRetirado,
      setAvisado,
      markRetirado,
    }),
    [isAvisado, isRetirado, markRetirado, setAvisado]
  );
};
