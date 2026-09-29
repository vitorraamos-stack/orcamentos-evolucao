import type { ArtStatus, OsOrder, ProdStatus } from "@/features/hubos/types";
import { moveOrder, sendOrderToProduction } from "@/features/hubos/api";
import { canTransitionOrderStatus } from "@/modules/orders/services/orderTransitions";
import type { HubRole } from "@/lib/hubRoles";

export type MoveBoardOrderInput = {
  order: OsOrder;
  board: "art" | "production";
  to: ArtStatus | ProdStatus;
  role: HubRole | null;
  isManager: boolean;
};

export async function moveBoardOrder(
  input: MoveBoardOrderInput,
  deps = { moveOrder, sendOrderToProduction }
) {
  const from =
    input.board === "art" ? input.order.art_status : input.order.prod_status;
  if (
    !from ||
    !canTransitionOrderStatus({
      board: input.board,
      from,
      to: input.to,
      role: input.role,
      isManager: input.isManager,
    })
  ) {
    throw new Error("Movimento não permitido para esta etapa ou papel.");
  }
  if (input.board === "art" && input.to === "Produzir") {
    const preset = input.order.delivery_deadline_preset;
    if (!preset)
      throw new Error(
        "Esta OS está sem prazo de produção. Solicite ao Comercial ou Gerência a definição do prazo antes de enviar para Produção."
      );
    if (preset === "CUSTOM" && !input.order.delivery_date)
      throw new Error(
        "Esta OS possui prazo personalizado, mas a data não foi definida. Solicite ao Comercial ou Gerência a correção da OS."
      );
    return deps.sendOrderToProduction({
      orderId: input.order.id,
      eventPayload: {
        board: "art",
        from,
        to: "Produzir",
      },
    });
  }
  return deps.moveOrder(input.order.id, input.board, input.to, {
    board: input.board,
    from,
    to: input.to,
  });
}
