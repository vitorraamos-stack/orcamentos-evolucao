import type {
  ArtStatus,
  DeliveryDeadlinePreset,
  OsOrder,
  ProdStatus,
} from "@/features/hubos/types";
import { moveOrder, sendOrderToProduction } from "@/features/hubos/api";
import { resolveDeliveryDate } from "@/features/hubos/deliveryDeadline";
import { canTransitionOrderStatus } from "@/modules/orders/services/orderTransitions";
import type { HubRole } from "@/lib/hubRoles";

export type MoveBoardOrderInput = {
  order: OsOrder;
  board: "art" | "production";
  to: ArtStatus | ProdStatus;
  role: HubRole | null;
  isManager: boolean;
  preset?: DeliveryDeadlinePreset | null;
  manualDate?: string | null;
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
    const preset = input.preset ?? input.order.delivery_deadline_preset;
    const startedAt = new Date().toISOString();
    const deliveryDate = resolveDeliveryDate({
      preset,
      startedAt,
      manualDate: input.manualDate ?? input.order.delivery_date,
    });
    if (!preset || !deliveryDate)
      throw new Error(
        "Defina o prazo de entrega antes de enviar para Produção."
      );
    return deps.sendOrderToProduction({
      orderId: input.order.id,
      deadlineStartedAt: startedAt,
      deliveryDate,
      eventPayload: {
        board: "art",
        from,
        to: "Produzir",
        delivery_deadline_preset: preset,
      },
    });
  }
  return deps.moveOrder(input.order.id, input.board, input.to, {
    board: input.board,
    from,
    to: input.to,
  });
}
