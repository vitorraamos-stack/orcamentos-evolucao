import { supabase } from "@/lib/supabase";
import {
  buildHubOrderFlowKey,
  type HubOrderFlowIdentity,
} from "./order-flow-key";

type RpcLikeError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

const TABLE_NAME = "hub_os_order_flow_state";
const ALLOW_DEV_FALLBACK = import.meta.env.DEV;

export type HubOrderFlowRow = {
  order_key: string;
  source_type: "os" | "os_orders";
  source_id: string;
  avisado_at: string | null;
  avisado_by: string | null;
  retirado_at: string | null;
  retirado_by: string | null;
  updated_at: string;
};

export type HubOrderFlowRetiradoFinalizeResult = HubOrderFlowRow & {
  order_prod_status: string;
  order_updated_at: string;
  already_retirado: boolean;
};

const isMissingRpcError = (error: unknown) => {
  const message = String(
    (error as { message?: string })?.message ?? ""
  ).toLowerCase();
  return (
    message.includes("could not find") ||
    message.includes("function") ||
    message.includes("pgrst202")
  );
};

const normalizeError = (error: unknown) => {
  if (error instanceof Error) return error;
  const rpcError = (error ?? {}) as RpcLikeError;
  const details = String(rpcError.details ?? "");
  if (details.includes("ORDER_FLOW_FORBIDDEN")) {
    return new Error("Você não tem permissão para alterar o fluxo global de OS.");
  }

  const message =
    rpcError.message ||
    rpcError.details ||
    "Erro ao sincronizar fluxo global de OS.";
  return new Error(message);
};

const assertRequiredRpc = (rpcName: string, error: unknown) => {
  if (!isMissingRpcError(error)) throw normalizeError(error);
  if (!ALLOW_DEV_FALLBACK) {
    throw new Error(
      `RPC obrigatória indisponível (${rpcName}). Aplique as migrations mais recentes do Hub OS para o fluxo global AVISADO/RETIRADO.`
    );
  }
};

export const listOrderFlowState = async (): Promise<HubOrderFlowRow[]> => {
  const response = await supabase.rpc("order_flow_list_secure");
  if (response.error) {
    assertRequiredRpc("order_flow_list_secure", response.error);

    const fallback = await supabase
      .from(TABLE_NAME)
      .select(
        "order_key,source_type,source_id,avisado_at,avisado_by,retirado_at,retirado_by,updated_at"
      );

    if (fallback.error) throw normalizeError(fallback.error);
    return (fallback.data ?? []) as HubOrderFlowRow[];
  }

  return (response.data ?? []) as HubOrderFlowRow[];
};

export const setOrderFlowAvisado = async (
  identity: HubOrderFlowIdentity,
  avisado: boolean
): Promise<HubOrderFlowRow> => {
  const response = await supabase.rpc("order_flow_set_avisado_secure", {
    p_order_key: buildHubOrderFlowKey(identity),
    p_source_type: identity.sourceType,
    p_source_id: identity.sourceId,
    p_avisado: avisado,
  });

  if (response.error) {
    assertRequiredRpc("order_flow_set_avisado_secure", response.error);

    const now = new Date().toISOString();
    const payload = avisado
      ? { avisado_at: now, retirado_at: null }
      : { avisado_at: null };

    const fallback = await supabase
      .from(TABLE_NAME)
      .upsert(
        {
          order_key: buildHubOrderFlowKey(identity),
          source_type: identity.sourceType,
          source_id: identity.sourceId,
          ...payload,
        },
        { onConflict: "order_key" }
      )
      .select(
        "order_key,source_type,source_id,avisado_at,avisado_by,retirado_at,retirado_by,updated_at"
      )
      .single();

    if (fallback.error) throw normalizeError(fallback.error);
    return fallback.data as HubOrderFlowRow;
  }

  return response.data as HubOrderFlowRow;
};

export const markOrderFlowRetirado = async (
  identity: HubOrderFlowIdentity
): Promise<HubOrderFlowRow> => {
  const response = await supabase.rpc("order_flow_mark_retirado_secure", {
    p_order_key: buildHubOrderFlowKey(identity),
    p_source_type: identity.sourceType,
    p_source_id: identity.sourceId,
  });

  if (response.error) {
    assertRequiredRpc("order_flow_mark_retirado_secure", response.error);

    const now = new Date().toISOString();
    const fallback = await supabase
      .from(TABLE_NAME)
      .upsert(
        {
          order_key: buildHubOrderFlowKey(identity),
          source_type: identity.sourceType,
          source_id: identity.sourceId,
          avisado_at: null,
          retirado_at: now,
        },
        { onConflict: "order_key" }
      )
      .select(
        "order_key,source_type,source_id,avisado_at,avisado_by,retirado_at,retirado_by,updated_at"
      )
      .single();

    if (fallback.error) throw normalizeError(fallback.error);
    return fallback.data as HubOrderFlowRow;
  }

  return response.data as HubOrderFlowRow;
};

export const markOrderFlowRetiradoAndFinalize = async (params: {
  identity: HubOrderFlowIdentity;
  actorName: string | null;
}) => {
  const response = await supabase.rpc(
    "order_flow_mark_retirado_and_finalize_secure",
    {
      p_order_key: buildHubOrderFlowKey(params.identity),
      p_source_type: params.identity.sourceType,
      p_source_id: params.identity.sourceId,
      p_actor_name: params.actorName,
    }
  );

  if (response.error) {
    if (isMissingRpcError(response.error)) {
      throw new Error(
        "Integração de retirada atômica indisponível. Aplique as migrations mais recentes do Hub OS."
      );
    }
    throw normalizeError(response.error);
  }

  const row = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!row) {
    throw new Error("Resposta inválida ao marcar retirada da OS.");
  }

  return row as HubOrderFlowRetiradoFinalizeResult;
};

export const getOrderFlowRealtimeTable = () => TABLE_NAME;
