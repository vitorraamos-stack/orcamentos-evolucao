import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detail = readFileSync(new URL("./OrderDetailPage.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./order-detail-premium.css", import.meta.url), "utf8");
const logistics = readFileSync(new URL("../components/OrderInstallationTab.tsx", import.meta.url), "utf8");

describe("EvoluSystem OS tabs — reliable loading and error recovery", () => {
  it("only skips previously successful tabs; retries failed tabs on reentry", () => {
    expect(detail).toContain("config.current.loading || (config.current.loaded && !config.current.error)");
    for (const call of ["listOrderItems(orderId)", "listOrderComments(orderId)", "listOrderActivities(orderId)", "listOrderFiles(orderId)"]) expect(detail).toContain(call);
    expect(detail).toContain('loaded: true, error: message(error)');
  });

  it("shows a loading state before any pending-agenda fallback", () => {
    expect(logistics).toContain("const [loading, setLoading] = useState(true);");
    expect(logistics).toContain("{loading ? (");
    expect(logistics).toContain('role="status"');
    expect(logistics).toContain("Carregando informações de logística");
    expect(logistics.indexOf("{loading ? (")).toBeLessThan(logistics.indexOf("{installation ? ("));
    expect(logistics).toContain("Aguardando agendamento.");
  });

  it("offers retry on logistics lookup errors while clearing stale records", () => {
    for (const fragment of [
      "if (error) throw error;", "setLoading(false)", "setRecord(null)",
      "setInstallationHistory([])", 'setFieldData({ installationId: null, status: "idle"',
      "setReloadKey(key => key + 1)", "[order.id, order.logistic_type, reloadKey]",
      'role="alert"', "Tentar novamente",
    ]) expect(logistics).toContain(fragment);
  });

  it("keeps checklist failures separate from the agenda and exposes a retry", () => {
    expect(logistics).toContain('status: "error"');
    expect(logistics).toContain("Não foi possível carregar o checklist e as evidências da instalação.");
    expect(logistics).toContain('{fieldView === "error" && (');
    expect(logistics).toContain("setExecutionReloadKey(key => key + 1)");
  });

  it("preserves logistics operations and the seven existing tabs", () => {
    for (const fragment of [
      "loadInstallationsForOrder(order.id)", "loadInstallationExecution(primary.id)",
      "selectPrimaryInstallation(rows)", 'from("os_deliveries")',
      'from("hub_os_order_flow_state")', "buildMapsUrl({", "buildWazeUrl({",
      "<InstallationChecklist", "<InstallationEvidenceGallery",
      "<OrderDeliverySummary delivery={delivery} />",
      "<OrderPickupSummary pickup={pickup} />",
    ]) expect(logistics).toContain(fragment);
    expect(detail).toContain("onValueChange={loadTab}");
    expect(detail).toContain("hubPermissions.isManager");
    expect((detail.match(/<TabsTrigger className="evolu-detail__tab"/g) ?? []).length).toBe(7);
  });
  it("offers consistent retry for every remotely loaded order tab", () => {
    for (const name of ["items", "production", "files", "comments", "history"]) {
      expect(detail).toContain('onRetry={() => void loadTab("' + name + '")}');
    }
    expect(detail).toContain('onClick={() => void loadDetail()}');
    expect(detail).toContain("Não foi possível abrir a OS");
    expect(detail).toContain("Voltar à Central de OS");
  });

  it("retains exactly seven labeled and keyboard-accessible sections", () => {
    expect(detail).toContain('aria-label="Seções da ordem de serviço"');
    expect((detail.match(/<TabsTrigger className="evolu-detail__tab"/g) ?? []).length).toBe(7);
    expect(styles).toContain("scroll-snap-type: x proximity");
    expect(styles).toContain("scroll-snap-align: start");
    expect(styles).toContain("overscroll-behavior-x: contain");
    expect(styles).toContain(".evolu-detail__tab:focus-visible");
  });

  it("does not duplicate responsibility or deadline cards outside Resumo", () => {
    const summary = detail.indexOf('value="summary"><OrderSummaryTab');
    const management = detail.indexOf('aria-label="Responsáveis e prazos"');
    const items = detail.indexOf('value="items"><OrderItemsTab');
    expect(summary).toBeGreaterThan(-1);
    expect(management).toBeGreaterThan(summary);
    expect(items).toBeGreaterThan(management);
    expect((detail.match(/aria-label="Responsáveis e prazos"/g) ?? []).length).toBe(1);
  });

  it("scopes OS and lazy tab reads to the current order and drops late responses", () => {
    expect(detail).toContain("readCoordinator.current.begin(orderId, \"detail\", true)");
    expect(detail).toContain("readCoordinator.current.begin(orderId, `tab:${tab}`)");
    expect(detail).toContain("readCoordinator.current.isCurrent(ticket)");
    expect(detail).toContain("readCoordinator.current.finish(ticket)");
    expect(detail).toContain("coordinator.invalidate()");
    expect(detail).toContain("coordinator.activate(orderId ?? null)");
    expect(detail).toContain("setItems(state<OrderItem[]>([]))");
    expect(detail).toContain("setComments(state<OrderComment[]>([]))");
    expect(detail).toContain('key={orderId} defaultValue="summary"');
    expect(detail).toContain("detail.order.id !== orderId");
  });

  it("keeps a read-after-write production refresh from overwriting newer results", () => {
    expect(detail).toContain('readCoordinator.current.begin(orderId, "production-data", true)');
    expect(detail).toContain("if (!readCoordinator.current.isCurrent(ticket)) return null;");
    expect(detail).toContain("if (refreshed !== null) toast.success(successText)");
    expect(detail).toContain("listItemOperations(orderId)");
    expect(detail).toContain("listOrderItems(orderId)");
  });

});
