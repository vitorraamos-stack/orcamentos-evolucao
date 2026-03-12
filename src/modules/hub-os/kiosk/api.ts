import { supabase } from "@/lib/supabase";
import { fetchOsByCode } from "../api";
import type {
  KioskBoardCard,
  KioskBoardMoveResult,
  KioskMoveAction,
  KioskSourceType,
} from "./types";

const isMissingRpcError = (error: unknown) => {
  const message = String((error as { message?: string })?.message ?? "").toLowerCase();
  return message.includes("could not find") || message.includes("function") || message.includes("pgrst202");
};

export const fetchKioskBoard = async () => {
  const { data, error } = await supabase.rpc("kiosk_board_list");
  if (error) throw error;
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

  if (secureResponse.error && !isMissingRpcError(secureResponse.error)) {
    throw secureResponse.error;
  }

  if (!secureResponse.error && secureResponse.data) {
    return secureResponse.data as KioskBoardCard;
  }

  const legacyResponse = await supabase.rpc("kiosk_board_register", {
    p_source_type: params.sourceType,
    p_source_id: params.sourceId,
    p_lookup_code: params.lookupCode,
    p_actor_id: params.actorId,
    p_terminal_id: params.terminalId,
  });

  if (legacyResponse.error) throw legacyResponse.error;
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

  if (secureResponse.error && !isMissingRpcError(secureResponse.error)) {
    throw secureResponse.error;
  }

  if (!secureResponse.error && secureResponse.data) {
    return secureResponse.data as KioskBoardCard;
  }

  const lookup = await fetchOsByCode(params.lookupCode);
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
  if (secureResponse.error && !isMissingRpcError(secureResponse.error)) {
    throw secureResponse.error;
  }

  if (secureResponse.error) {
    const fallback = await supabase.rpc("kiosk_board_move", {
      p_order_key: params.orderKey,
      p_action: params.action,
      p_actor_id: params.actorId,
      p_terminal_id: params.terminalId,
    });

    if (fallback.error) throw fallback.error;
    data = fallback.data;
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    throw new Error("Resposta inválida ao mover OS no quiosque.");
  }

  return row as KioskBoardMoveResult;
};
