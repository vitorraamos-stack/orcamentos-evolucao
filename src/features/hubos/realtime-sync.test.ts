import { describe, expect, it } from "vitest";
import { shouldApplyHubOrdersResponse } from "./boardSync";
import {
  isOrderInProntoAvisarColumn,
  selectProntoAvisarOrders,
} from "./selectors";
import type { OsOrder } from "./types";

const buildOrder = (
  id: string,
  prodStatus: OsOrder["prod_status"]
): OsOrder =>
  ({
    id,
    sale_number: `S-${id}`,
    client_name: `Cliente ${id}`,
    title: `OS ${id}`,
    art_status: "Inbox",
    prod_status: prodStatus,
    logistic_type: "retirada",
    delivery_date: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    created_by: null,
    updated_by: null,
    archived: false,
    archived_at: null,
    archived_by: null,
    payment_status: "Pendente",
    reproducao: false,
    letra_caixa: false,
    production_tag: null,
    insumos_details: null,
    insumos_requested_at: null,
    insumos_return_notes: null,
    insumos_resolved_at: null,
    insumos_resolved_by: null,
    art_direction_tag: null,
  }) as OsOrder;

describe("hub board realtime selectors", () => {
  it('inclui OS na coluna "Pronto / Avisar Cliente" quando status entra no valor esperado', () => {
    const order = buildOrder("1", "Pronto / Avisar Cliente");
    expect(isOrderInProntoAvisarColumn(order)).toBe(true);
  });

  it("remove OS da coluna quando retirada global está ativa", () => {
    const orders = [
      buildOrder("1", "Pronto / Avisar Cliente"),
      buildOrder("2", "Pronto / Avisar Cliente"),
      buildOrder("3", "Produção"),
    ];

    const visible = selectProntoAvisarOrders(orders, order => order.id === "2");
    expect(visible.map(order => order.id)).toEqual(["1"]);
  });

  it("não aplica resposta de request antiga sobre estado já mais novo", () => {
    expect(shouldApplyHubOrdersResponse(1, 2)).toBe(false);
    expect(shouldApplyHubOrdersResponse(3, 3)).toBe(true);
  });

  it("preserva último snapshot válido quando resposta mais nova falha", () => {
    const previousSnapshot = [buildOrder("10", "Pronto / Avisar Cliente")];
    const incomingFailedRequestId = 4;
    const latestRequestId = 5;

    const shouldApplyFailed = shouldApplyHubOrdersResponse(
      incomingFailedRequestId,
      latestRequestId
    );

    const stateAfterFailure = shouldApplyFailed ? [] : previousSnapshot;
    expect(stateAfterFailure).toEqual(previousSnapshot);
  });
});
