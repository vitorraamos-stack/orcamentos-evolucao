import { supabase } from "@/lib/supabase";
import { fetchOsByCode } from "../api";
import {
  assertOfficialKioskRpc,
  getRpcUnavailableError,
  isMissingRpcError,
} from "./contract";
import type {
  KioskBoardCard,
  KioskBoardMoveResult,
  KioskMoveAction,
  KioskOrphanCleanupResult,
  KioskSourceType,
} from "./types";

type RpcLikeError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

const ALLOW_DEV_FALLBACK = import.meta.env.DEV;

const toError = (error: unknown) => {
  if (error instanceof Error) return error;
  const rpcError = (error ?? {}) as RpcLikeError;
  const message =
    rpcError.message || rpcError.details || "Erro ao consultar OS. Tente novamente.";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("column") &&
    normalized.includes("os_number") &&
    normalized.includes("does not exist")
  ) {
    return new Error(
      "Integração do quiosque desatualizada no banco. Aplique as migrations mais recentes do Hub OS e tente novamente."
    );
  }

  if (rpcError.code || rpcError.details) {
    return new Error(message, {
      cause: {
        code: rpcError.code,
        details: rpcError.details,
        hint: rpcError.hint,
      },
    });
  }

  return new Error(message);
};

export const fetchKioskBoard = async () => {
  const { data, error } = await supabase.rpc("kiosk_board_list");
  if (error && isMissingRpcError(error)) {
    throw getRpcUnavailableError("kiosk_board_list");
  }
  if (error) throw toError(error);
  return (data ?? []) as KioskBoardCard[];
};

const registerKioskOrderBySource = async (params: {
  sourceType: KioskSourceType;
  sourceId: string;
  lookupCode: string;
  actorId: string | null;
  terminalId: string;
}) => {
  const secureResponse = await supabase.rpc("kiosk_board_register_secure", {
    p_source_type: params.sourceType,
    p_source_id: params.sourceId,
    p_lookup_code: params.lookupCode,
    p_actor_id: params.actorId,
    p_terminal_id: params.terminalId,
  });

  if (secureResponse.error) {
    assertOfficialKioskRpc({
      rpcName: "kiosk_board_register_secure",
      error: secureResponse.error,
      allowFallback: ALLOW_DEV_FALLBACK,
      normalizeError: toError,
    });
  }

  if (!secureResponse.error && secureResponse.data) {
    return secureResponse.data as KioskBoardCard;
  }

  if (!ALLOW_DEV_FALLBACK) {
    throw new Error(
      "RPC kiosk_board_register_secure retornou resposta vazia em produção. Verifique a integração do backend do quiosque."
    );
  }

  const legacyResponse = await supabase.rpc("kiosk_board_register", {
    p_source_type: params.sourceType,
    p_source_id: params.sourceId,
    p_lookup_code: params.lookupCode,
    p_actor_id: params.actorId,
    p_terminal_id: params.terminalId,
  });

  if (legacyResponse.error) throw toError(legacyResponse.error);
  return legacyResponse.data as KioskBoardCard;
};

export const registerKioskOrderByCode = async (params: {
  lookupCode: string;
  actorId: string | null;
  terminalId: string;
}) => {
  const secureResponse = await supabase.rpc("kiosk_board_register_by_code", {
    p_lookup_code: params.lookupCode,
    p_actor_id: params.actorId,
    p_terminal_id: params.terminalId,
  });

  if (secureResponse.error) {
    assertOfficialKioskRpc({
      rpcName: "kiosk_board_register_by_code",
      error: secureResponse.error,
      allowFallback: ALLOW_DEV_FALLBACK,
      normalizeError: toError,
    });
  }

  if (!secureResponse.error && secureResponse.data) {
    return secureResponse.data as KioskBoardCard;
  }

  if (!ALLOW_DEV_FALLBACK) {
    throw new Error(
      "RPC kiosk_board_register_by_code retornou resposta vazia em produção. Verifique a integração do backend do quiosque."
    );
  }

  let lookup;
  try {
    lookup = await fetchOsByCode(params.lookupCode);
  } catch (error) {
    throw toError(error);
  }

  if (!lookup) {
    throw new Error("OS não encontrada. Verifique o número da etiqueta.");
  }

  return registerKioskOrderBySource({
    sourceType: lookup.source,
    sourceId: lookup.id,
    lookupCode: params.lookupCode,
    actorId: params.actorId,
    terminalId: params.terminalId,
  });
};

export const moveKioskOrder = async (params: {
  orderKey: string;
  action: KioskMoveAction;
  actorId: string | null;
  terminalId: string;
}) => {
  const secureResponse = await supabase.rpc("kiosk_board_move_secure", {
    p_order_key: params.orderKey,
    p_action: params.action,
    p_actor_id: params.actorId,
    p_terminal_id: params.terminalId,
  });

  let data = secureResponse.data;
  if (secureResponse.error) {
    assertOfficialKioskRpc({
      rpcName: "kiosk_board_move_secure",
      error: secureResponse.error,
      allowFallback: ALLOW_DEV_FALLBACK,
      normalizeError: toError,
    });
  }

  if (secureResponse.error) {
    const fallback = await supabase.rpc("kiosk_board_move", {
      p_order_key: params.orderKey,
      p_action: params.action,
      p_actor_id: params.actorId,
      p_terminal_id: params.terminalId,
    });

    if (fallback.error) throw toError(fallback.error);
    data = fallback.data;
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    throw new Error("Resposta inválida ao mover OS no quiosque.");
  }

  return row as KioskBoardMoveResult;
};

export const completeKioskInstallation = async (params: {
  orderKey: string;
  feedback: string;
  actorId: string | null;
  terminalId: string;
}) => {
  const response = await supabase.rpc("kiosk_board_complete_installation_secure", {
    p_order_key: params.orderKey,
    p_feedback: params.feedback,
    p_actor_id: params.actorId,
    p_terminal_id: params.terminalId,
  });

  if (response.error) {
    assertOfficialKioskRpc({
      rpcName: "kiosk_board_complete_installation_secure",
      error: response.error,
      allowFallback: false,
      normalizeError: toError,
    });
  }

  const row = Array.isArray(response.data) ? response.data[0] : null;
  if (!row) {
    throw new Error("Resposta inválida ao finalizar instalação no quiosque.");
  }

  return row as KioskBoardMoveResult;
};

export const cleanupKioskOrphanOrders = async (params?: { orderKey?: string }) => {
  const secureResponse = await supabase.rpc("kiosk_board_cleanup_orphans_secure", {
    p_order_key: params?.orderKey ?? null,
  });

  if (secureResponse.error) {
    assertOfficialKioskRpc({
      rpcName: "kiosk_board_cleanup_orphans_secure",
      error: secureResponse.error,
      allowFallback: ALLOW_DEV_FALLBACK,
      normalizeError: toError,
    });
  }

  let data = secureResponse.data;
  if (secureResponse.error) {
    const fallback = await supabase.rpc("kiosk_board_cleanup_orphans", {
      p_order_key: params?.orderKey ?? null,
    });
    if (fallback.error) throw toError(fallback.error);
    data = fallback.data;
  }

  return (data ?? []) as KioskOrphanCleanupResult[];
};
