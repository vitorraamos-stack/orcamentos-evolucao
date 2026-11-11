import { describe, expect, it } from "vitest";
import { countOpenDeliveries, countWaitingInstallations, type PendingOrder } from "./logisticsPendingCounts";

const order = (id: string, logistic_type: string, prod_status: string, archived = false): PendingOrder =>
  ({ id, logistic_type, prod_status, archived });

describe("contadores de pendências da navegação", () => {
  it("mostra a badge para uma OS aguardando agendamento", () => {
    const waiting = [order("a", "instalacao", "Pronto / Avisar Cliente")];
    expect(countWaitingInstallations({ orders: waiting, active: [] })).toBe(1);
  });

  it("remove a badge imediatamente após agendar, mesmo antes da mudança do status da OS", () => {
    const orders = [order("a", "instalacao", "Pronto / Avisar Cliente")];
    expect(countWaitingInstallations({ orders, active: [{ os_id: "a" }] })).toBe(0);
    orders[0] = order("a", "instalacao", "Instalação Agendada");
    expect(countWaitingInstallations({ orders, active: [{ os_id: "a" }] })).toBe(0);
  });

  it("não conta instalação em execução, concluída ou OS arquivada", () => {
    const orders = [
      order("a", "instalacao", "Instalação Agendada"),
      order("b", "instalacao", "Pronto / Avisar Cliente", true),
      order("c", "instalacao", "Finalizados"),
      order("d", "entrega", "Pronto / Avisar Cliente"),
      order("e", "instalacao", "Instalação Agendada"),
    ];
    expect(countWaitingInstallations({
      orders, active: [{ os_id: "a" }],
    })).toBe(1);
    expect(countWaitingInstallations({
      orders, active: [{ os_id: "a" }, { os_id: "e" }],
    })).toBe(0);
  });

  it("retira entregas concluídas e retiradas registradas e não duplica cadastros", () => {
    expect(countOpenDeliveries({
      active: [{ os_id: "a" }, { os_id: "b" }],
      orders: [
        order("a", "entrega", "Logística (Entrega/Transportadora)"),
        order("c", "entrega", "Pronto / Avisar Cliente"),
        order("d", "retirada", "Pronto / Avisar Cliente"),
        order("e", "retirada", "Finalizados"),
        order("f", "retirada", "Finalizados", true),
        order("g", "entrega", "Finalizados"),
      ],
      flows: [{ source_type: "os_orders", source_id: "e", retirado_at: "2026-11-10T13:00:00Z" }],
    })).toBe(4);
  });
});
