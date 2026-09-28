import { describe, expect, it } from "vitest";
import {
  DELIVERY_MODE_LABEL,
  DELIVERY_STATUS_LABEL,
  isLegacyDelivery,
  isWaitingDelivery,
  pickupState,
} from "./deliveries";
import type { LogisticsOrder } from "@/modules/installations/types";
const order = {
  id: "o",
  sale_number: "1",
  client_name: "C",
  delivery_date: null,
  address: null,
  address_lat: null,
  address_lng: null,
  logistic_type: "entrega",
  prod_status: "Pronto / Avisar Cliente",
  archived: false,
  updated_at: "",
} satisfies LogisticsOrder;
describe("delivery logistics domain", () => {
  it("exposes Portuguese labels", () => {
    expect(DELIVERY_MODE_LABEL.CARRIER).toBe("Transportadora");
    expect(DELIVERY_STATUS_LABEL.IN_TRANSIT).toBe("Em trânsito");
  });
  it("derives waiting and legacy queues", () => {
    expect(isWaitingDelivery(order, new Set())).toBe(true);
    expect(
      isLegacyDelivery(
        { ...order, prod_status: "Logística (Entrega/Transportadora)" },
        new Set()
      )
    ).toBe(true);
  });
  it("derives pickup notice and completion", () => {
    expect(pickupState()).toBe("Aguardando aviso");
    expect(pickupState({ avisado_at: "x", retirado_at: null } as any)).toBe(
      "Cliente avisado"
    );
    expect(pickupState({ avisado_at: "x", retirado_at: "y" } as any)).toBe(
      "Retirado"
    );
  });
});
