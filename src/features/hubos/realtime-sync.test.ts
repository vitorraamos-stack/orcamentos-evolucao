import { describe, expect, it, vi } from "vitest";
import {
  createCoalescedRefetchScheduler,
  isRealtimeChannelHealthy,
  shouldApplyHubOrdersResponse,
  shouldRefreshOnVisibility,
  shouldRunRecoverySync,
} from "./boardSync";
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


  it("ressincroniza no visibilitychange quando aba volta para visible", () => {
    expect(shouldRefreshOnVisibility("visible")).toBe(true);
    expect(shouldRefreshOnVisibility("hidden")).toBe(false);
  });


  it("marca canal realtime como saudável apenas quando SUBSCRIBED", () => {
    expect(isRealtimeChannelHealthy("SUBSCRIBED")).toBe(true);
    expect(isRealtimeChannelHealthy("TIMED_OUT")).toBe(false);
    expect(isRealtimeChannelHealthy("CHANNEL_ERROR")).toBe(false);
  });

  it("executa recovery sync só quando canal está indisponível, online e visível", () => {
    expect(
      shouldRunRecoverySync({
        isSubscribed: false,
        isOnline: true,
        visibilityState: "visible",
      })
    ).toBe(true);

    expect(
      shouldRunRecoverySync({
        isSubscribed: true,
        isOnline: true,
        visibilityState: "visible",
      })
    ).toBe(false);

    expect(
      shouldRunRecoverySync({
        isSubscribed: false,
        isOnline: false,
        visibilityState: "visible",
      })
    ).toBe(false);

    expect(
      shouldRunRecoverySync({
        isSubscribed: false,
        isOnline: true,
        visibilityState: "hidden",
      })
    ).toBe(false);
  });
  it("coalesce eventos realtime próximos em um único refresh", () => {
    vi.useFakeTimers();
    const refetch = vi.fn();
    const scheduler = createCoalescedRefetchScheduler(refetch, { delayMs: 180 });

    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();

    vi.advanceTimersByTime(179);
    expect(refetch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(refetch).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("permite cancelar refresh pendente no cleanup", () => {
    vi.useFakeTimers();
    const refetch = vi.fn();
    const scheduler = createCoalescedRefetchScheduler(refetch, { delayMs: 120 });

    scheduler.schedule();
    scheduler.cancel();

    vi.advanceTimersByTime(200);
    expect(refetch).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

});
