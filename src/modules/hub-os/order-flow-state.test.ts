import { describe, expect, it } from "vitest";
import {
  buildHubOrderFlowKey,
  buildHubOrderFlowKeyFromOsId,
  parseHubOrderFlowKey,
} from "./order-flow-key";
import {
  filterHubReadyToNotifyOrders,
  filterKioskActiveCards,
} from "./order-flow-selectors";
import {
  removeOrderFlowRow,
  toOrderFlowMap,
  upsertOrderFlowRow,
} from "./order-flow-state-utils";
import type { KioskBoardCard } from "./kiosk/types";

describe("order flow global", () => {
  it("padroniza chave canônica entre Hub e Quiosque", () => {
    const sourceId = "11111111-1111-1111-1111-111111111111";
    const osKey = buildHubOrderFlowKeyFromOsId(sourceId);
    const osOrdersKey = buildHubOrderFlowKey({
      sourceType: "os_orders",
      sourceId,
    });

    expect(osKey).toBe(`os:${sourceId}`);
    expect(osOrdersKey).toBe(`os_orders:${sourceId}`);
    expect(parseHubOrderFlowKey(osKey)).toEqual({ sourceType: "os", sourceId });
    expect(parseHubOrderFlowKey(osOrdersKey)).toEqual({
      sourceType: "os_orders",
      sourceId,
    });
    expect(parseHubOrderFlowKey(sourceId)).toBeNull();
  });

  it("aplica estado de retirada e aviso em memória", () => {
    const rowAvisado = {
      order_key: "os:1",
      source_type: "os",
      source_id: "1",
      avisado_at: "2026-01-01T10:00:00.000Z",
      avisado_by: "u1",
      retirado_at: null,
      retirado_by: null,
      updated_at: "2026-01-01T10:00:00.000Z",
    } as const;

    const rowRetirado = {
      ...rowAvisado,
      avisado_at: null,
      avisado_by: null,
      retirado_at: "2026-01-01T11:00:00.000Z",
      retirado_by: "u1",
      updated_at: "2026-01-01T11:00:00.000Z",
    };

    const map = toOrderFlowMap([rowAvisado]);
    expect(Boolean(map["os:1"]?.avisado_at)).toBe(true);
    expect(Boolean(map["os:1"]?.retirado_at)).toBe(false);

    const next = upsertOrderFlowRow(map, rowRetirado);
    expect(Boolean(next["os:1"]?.avisado_at)).toBe(false);
    expect(Boolean(next["os:1"]?.retirado_at)).toBe(true);

    const stale = upsertOrderFlowRow(next, {
      ...rowAvisado,
      updated_at: "2026-01-01T09:00:00.000Z",
    });
    expect(Boolean(stale["os:1"]?.retirado_at)).toBe(true);

    const cleared = removeOrderFlowRow(next, "os:1");
    expect(cleared["os:1"]).toBeUndefined();
  });

  it("remove card do Hub e do Quiosque quando retirada global fica true", () => {
    const hubOrders = [
      { id: "1", status_id: "s1" },
      { id: "2", status_id: "s1" },
    ] as any[];

    const hubVisible = filterHubReadyToNotifyOrders(
      hubOrders,
      orderKey => orderKey === "os:2"
    );
    expect(hubVisible.map(order => order.id)).toEqual(["1"]);

    const cards = [
      {
        id: "c1",
        order_key: "os:1",
        source_type: "os",
        source_id: "1",
        os_number: 1,
        sale_number: null,
        client_name: null,
        title: "A",
        description: null,
        address: null,
        delivery_date: null,
        delivery_mode: "RETIRADA",
        production_tag: null,
        upstream_status: "Em produção",
        current_stage: "pronto_avisar",
        material_ready: false,
        terminal_id: null,
        last_lookup_code: null,
        created_by: null,
        updated_by: null,
        created_at: "2026-01-01T10:00:00.000Z",
        updated_at: "2026-01-01T10:00:00.000Z",
      },
      {
        id: "c2",
        order_key: "os:2",
        source_type: "os",
        source_id: "2",
        os_number: 2,
        sale_number: null,
        client_name: null,
        title: "B",
        description: null,
        address: null,
        delivery_date: null,
        delivery_mode: "RETIRADA",
        production_tag: null,
        upstream_status: "Finalizado",
        current_stage: "pronto_avisar",
        material_ready: false,
        terminal_id: null,
        last_lookup_code: null,
        created_by: null,
        updated_by: null,
        created_at: "2026-01-01T10:00:00.000Z",
        updated_at: "2026-01-01T10:00:00.000Z",
      },
    ] satisfies KioskBoardCard[];

    const active = filterKioskActiveCards(
      cards,
      key => key === "os:1",
      status => String(status).toLowerCase().includes("finaliz")
    );

    expect(active).toHaveLength(0);
  });
});
