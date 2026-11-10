import { describe, expect, it } from "vitest";
import { countOpenDeliveries, countOpenInstallations, type PendingOrder } from "./logisticsPendingCounts";

const order = (id: string, logistic_type: string, prod_status: string, archived = false): PendingOrder =>
  ({ id, logistic_type, prod_status, archived });

describe("contadores de pendências da navegação", () => {
  it("conta instalações aguardando e em aberto sem duplicar OS agendada", () => {
    const active = [
      { os_id: "a", team_id: "team", responsible_id: null },
      { os_id: "b", team_id: null, responsible_id: "worker" },
    ];
    const orders = [
      order("a", "instalacao", "Instalação Agendada"),
      order("c", "instalacao", "Pronto / Avisar Cliente"),
      order("d", "instalacao", "Instalação Agendada"),
      order("e", "instalacao", "Pronto / Avisar Cliente", true),
      order("f", "entrega", "Pronto / Avisar Cliente"),
    ];
    expect(countOpenInstallations({
      active, orders, teamIds: new Set(["team"]), userId: "worker",
      isManager: false, agendaOnly: false,
    })).toBe(4);
    expect(countOpenInstallations({
      active, orders, teamIds: new Set(), userId: "worker",
      isManager: false, agendaOnly: true,
    })).toBe(2);
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
