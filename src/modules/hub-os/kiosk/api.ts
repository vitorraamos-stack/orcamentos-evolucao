import { supabase } from "@/lib/supabase";
import type { KioskBoardCard, KioskBoardMoveResult, KioskMoveAction, KioskSourceType } from "./types";

export const fetchKioskBoard = async () => {
  const { data, error } = await supabase.rpc("kiosk_board_list");
  if (error) throw error;
  return (data ?? []) as KioskBoardCard[];
};

export const registerKioskOrder = async (params: {
  sourceType: KioskSourceType;
  sourceId: string;
  lookupCode: string;
  actorId: string | null;
  terminalId: string;
}) => {
  const { data, error } = await supabase.rpc("kiosk_board_register", {
    p_source_type: params.sourceType,
    p_source_id: params.sourceId,
    p_lookup_code: params.lookupCode,
    p_actor_id: params.actorId,
    p_terminal_id: params.terminalId,
  });

  if (error) throw error;
  return data as KioskBoardCard;
};

export const moveKioskOrder = async (params: {
  orderKey: string;
  action: KioskMoveAction;
  actorId: string | null;
  terminalId: string;
}) => {
  const { data, error } = await supabase.rpc("kiosk_board_move", {
    p_order_key: params.orderKey,
    p_action: params.action,
    p_actor_id: params.actorId,
    p_terminal_id: params.terminalId,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    throw new Error("Resposta inválida ao mover OS no quiosque.");
  }

  return row as KioskBoardMoveResult;
};
