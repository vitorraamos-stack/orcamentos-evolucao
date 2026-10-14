import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detail = readFileSync(new URL("./OrderDetailPage.tsx", import.meta.url), "utf8");
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
      "setInstallationHistory([])", "setFieldData({ checklist: [], evidence: [] })",
      "setReloadKey(key => key + 1)", "[order.id, order.logistic_type, reloadKey]",
      'role="alert"', "Tentar novamente",
    ]) expect(logistics).toContain(fragment);
  });

  it("keeps checklist failures separate from the agenda and exposes a retry", () => {
    expect(logistics).toContain("if (alive) setExecutionError(true)");
    expect(logistics).toContain("Não foi possível carregar o checklist e as evidências da instalação.");
    expect(logistics).toContain("{executionError && (");
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
});
