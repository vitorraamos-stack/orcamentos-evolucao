import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Delivery } from "@/modules/deliveries/types";
import type { HubOrderFlowRow } from "@/modules/hub-os/order-flow-api";
import { OrderDeliverySummary, OrderPickupSummary, installationExecutionViewState } from "./OrderLogisticsSummary";

const parent = readFileSync(new URL("./OrderInstallationTab.tsx", import.meta.url), "utf8");
const delivery: Delivery = {
  id: "delivery-1", os_id: "os-1", mode: "CARRIER", status: "IN_TRANSIT",
  scheduled_at: "2026-10-14T15:00:00Z", assigned_to: null,
  vehicle_label: null, carrier_name: "Transportadora Sul", tracking_code: "ABC123",
  recipient_name: "Recepção", notes: "Entregar com cuidado", completed_at: null,
  cancelled_at: null, cancelled_reason: null,
};
const pickup: HubOrderFlowRow = {
  order_key: "os_orders:os-1", source_type: "os_orders", source_id: "os-1",
  avisado_at: "2026-10-14T13:00:00Z", avisado_by: "u-1",
  retirado_at: null, retirado_by: null, updated_at: "2026-10-14T13:00:00Z",
};

describe("EvoluSystem — read-only logistics summary", () => {
  it("displays delivery status, transport, date, tracking and recipient separately", () => {
    const html = renderToStaticMarkup(<OrderDeliverySummary delivery={delivery} />);
    for (const label of ["Em trânsito", "Transportadora", "Modalidade", "Agendamento", "Transporte", "Rastreio", "ABC123", "Recepção", "Destinatário", "Entregar com cuidado"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('aria-label="Detalhes da entrega"');
    expect(html).toContain("sm:grid-cols-2");
  });

  it("preserves missing delivery data and optional information", () => {
    const html = renderToStaticMarkup(<OrderDeliverySummary delivery={{
      ...delivery, mode: "OWN_DELIVERY", status: "SCHEDULED", scheduled_at: null,
      carrier_name: null, vehicle_label: null, tracking_code: null,
      recipient_name: null, notes: null,
    }} />);
    for (const label of ["Entrega própria", "Agendada", "Sem horário", "Responsável não informado", "Não informado"]) {
      expect(html).toContain(label);
    }
    expect(html).not.toContain("Destinatário");
    expect(html).not.toContain("Observações");
  });

  it("presents delivery completion and cancellation data only when available", () => {
    const done = renderToStaticMarkup(<OrderDeliverySummary delivery={{
      ...delivery, status: "COMPLETED", completed_at: "2026-10-14T18:00:00Z",
    }} />);
    expect(done).toContain("Entregue em");
    const stopped = renderToStaticMarkup(<OrderDeliverySummary delivery={{
      ...delivery, status: "CANCELLED", cancelled_at: "2026-10-14T18:00:00Z",
      cancelled_reason: "Endereço não localizado",
    }} />);
    expect(stopped).toContain("Cancelada em");
    expect(stopped).toContain("Endereço não localizado");
  });

  it("shows pickup notification and completion distinctly", () => {
    const waiting = renderToStaticMarkup(<OrderPickupSummary pickup={null} />);
    expect(waiting).toContain("Aguardando aviso");
    expect(waiting).toContain("Aviso ao cliente");
    expect(waiting.match(/Pendente/g)).toHaveLength(2);
    const notified = renderToStaticMarkup(<OrderPickupSummary pickup={pickup} />);
    expect(notified).toContain("Cliente avisado");
    expect(notified).toContain("Pendente");
    const collected = renderToStaticMarkup(<OrderPickupSummary pickup={{
      ...pickup, retirado_at: "2026-10-14T18:00:00Z",
    }} />);
    expect(collected).toContain("Retirado");
    expect(collected).not.toContain("Pendente");
  });

  it("preserves installation records, checklist, evidence, directions and logistics lookups", () => {
    for (const required of [
      "loadInstallationsForOrder(order.id)",
      "loadInstallationExecution(primary.id)",
      "selectPrimaryInstallation(rows)",
      'from("os_deliveries")',
      'from("hub_os_order_flow_state")',
      "<InstallationChecklist", "<InstallationEvidenceGallery",
      "buildMapsUrl({", "buildWazeUrl({",
      "<OrderDeliverySummary delivery={delivery} />",
      "<OrderPickupSummary pickup={pickup} />",
      "Abrir Instalações", "Abrir Entregas",
    ]) expect(parent).toContain(required);
    expect(parent).toContain('rel="noopener noreferrer"');
  });
});

describe("EvoluSystem — installation field-data feedback", () => {
  const currentId = "installation-fixture-1";

  it("distinguishes absent agenda from pending checklist and evidence", () => {
    const idle = { installationId: null, status: "idle" as const };
    expect(installationExecutionViewState(idle, null)).toBe("none");
    expect(installationExecutionViewState(idle, currentId)).toBe("loading");
  });

  it("does not expose data or a stale failure belonging to another installation", () => {
    const stale = { installationId: "installation-old", status: "ready" as const };
    expect(installationExecutionViewState(stale, currentId)).toBe("loading");
    expect(installationExecutionViewState({ ...stale, status: "error" }, currentId)).toBe("loading");
  });

  it("reports loading, ready and failed states only for the current installation", () => {
    for (const status of ["loading", "ready", "error"] as const) {
      expect(installationExecutionViewState({ installationId: currentId, status }, currentId)).toBe(status);
    }
  });

  it("keeps logistics and execution retries independent, without writes", () => {
    expect(parent).toContain("Carregando checklist e evidências da instalação");
    expect(parent).toContain('fieldView === "ready" && fieldData.checklist.length > 0');
    expect(parent).toContain('fieldView === "ready" && fieldData.evidence.length > 0');
    expect(parent).toContain('fieldView === "error"');
    expect(parent).toContain("setReloadKey(key => key + 1)");
    expect(parent).toContain("setExecutionReloadKey(key => key + 1)");
    expect(parent).toContain("[primaryInstallationId, executionReloadKey]");
    expect(parent).toContain("return () => { alive = false; };");
  });
});
