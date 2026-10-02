import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./DeliveriesPage.tsx", import.meta.url),
  "utf8"
);

describe("Central de Entregas", () => {
  it("usa os cinco indicadores derivados", () => {
    expect(source).toContain("summarizeDeliveryWorkspace");
    expect(source).toContain("<DeliverySummaryCards");
  });
  it("mantém contadores das quatro tabs", () => {
    expect(source).toContain("{summary.waiting}");
    expect(source).toContain("{summary.pickup}");
    expect(source).toContain("{activeDeliveries.length}");
    expect(source).toContain("{history.length}");
  });
  it("separa retiradas ativas e concluídas", () => {
    expect(source).toContain("!flowFor(order)?.retirado_at");
    expect(source).toContain("Boolean(flowFor(order)?.retirado_at)");
    expect(source).toContain(
      "buildCompletedLogistics(completedDeliveries, completedPickups"
    );
  });
  it("desabilita ações de retirada e mostra progresso", () => {
    expect(source).toMatch(
      /const flow = flowFor\(selectedPickup\),\s+busy = pickupBusyId === selectedPickup\.id/
    );
    expect(source).toContain('busy ? "Concluindo..." : "Marcar retirado"');
  });
  it("protege retirada contra envio duplo antes da chamada", () => {
    const guard = source.indexOf(
      "if (pickupBusyRef.current) return",
      source.indexOf("const pickup =")
    );
    const lock = source.indexOf("pickupBusyRef.current = order.id", guard);
    const request = source.indexOf(
      "await markOrderFlowRetiradoAndFinalize",
      lock
    );
    expect(guard).toBeGreaterThan(-1);
    expect(lock).toBeGreaterThan(guard);
    expect(request).toBeGreaterThan(lock);
  });
  it("preserva feedback de sucesso e falha da retirada", () => {
    expect(source).toContain(
      'toast.success("Retirada concluída e OS finalizada.")'
    );
    expect(source).toContain('"Não foi possível concluir a retirada."');
  });
  it("preserva as três subscriptions Realtime", () => {
    for (const table of [
      "os_deliveries",
      "hub_os_order_flow_state",
      "os_orders",
    ])
      expect(source).toContain(`table: "${table}"`);
  });
  it("usa tabs controladas e seleções independentes", () => {
    expect(source).toContain("value={activeTab}");
    expect(source).toContain("selectedWaitingId");
    expect(source).toContain("selectedPickupId");
    expect(source).toContain("selectedDeliveryId");
  });
  it("mantém ações mutáveis sob a permissão canônica", () => {
    expect(source).toContain("hubPermissions.canManageDeliveries &&");
  });
  it("mantém os contratos canônicos de mutação", () => {
    for (const action of [
      "setOrderFlowAvisado",
      "markOrderFlowRetiradoAndFinalize",
      "deliveryAction",
      "scheduleDelivery",
      "updateDelivery",
    ])
      expect(source).toContain(action);
  });
});
