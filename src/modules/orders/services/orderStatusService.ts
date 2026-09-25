import { supabase } from "@/lib/supabase";
import type { ArtStatus, OsOrder, ProdStatus } from "@/features/hubos/types";
import type { HubRole } from "@/lib/hubRoles";
import { canTransitionOrderStatus } from "./orderTransitions";

export type StatusTransitionInput = {
  orderId: string;
  board: "art" | "production";
  from: ArtStatus | ProdStatus;
  to: ArtStatus | ProdStatus;
  context: { role: HubRole | null; isManager?: boolean };
};

export async function transitionOrderStatus(
  input: StatusTransitionInput,
  move = (args: Record<string, unknown>) => supabase.rpc("hub_os_move_order_secure", args)
): Promise<OsOrder> {
  if (!canTransitionOrderStatus({ ...input.context, board: input.board, from: input.from, to: input.to })) {
    throw new Error("Transição de etapa não permitida para este usuário.");
  }
  const { data, error } = await move({
    p_os_id: input.orderId,
    p_next_art_status: input.board === "art" ? input.to : null,
    p_next_prod_status: input.board === "production" ? input.to : input.to === "Produzir" ? "Produção" : null,
    p_event_payload: { board: input.board, from: input.from, to: input.to },
  });
  if (error) throw new Error(error.message);
  return data as OsOrder;
}

