import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detail = readFileSync(new URL("./OrderDetailPage.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../components/OrderHeader.tsx", import.meta.url), "utf8");
const flow = readFileSync(new URL("../components/OrderFlowProgress.tsx", import.meta.url), "utf8");

describe("EvoluSystem — OS detail premium visual contract", () => {
  it("adds a return breadcrumb and seven navigable tab sections", () => {
    expect(detail).toContain('href="/os"');
    expect(detail).toContain("Voltar à Central de OS");
    expect(detail).toContain('aria-label="Caminho"');
    expect(detail).toContain('onValueChange={loadTab}');
    expect((detail.match(/<TabsTrigger className="evolu-detail__tab"/g) ?? []).length).toBe(7);
    for (const section of ["summary", "items", "production", "installation", "files", "comments", "history"]) {
      expect(detail).toContain('value="' + section + '"');
    }
  });

  it("places flow above the tab navigation, which stays directly above the details", () => {
    const headerIndex = detail.indexOf("<OrderHeader order={detail.order}");
    const flowIndex = detail.indexOf("<OrderFlowProgress order={detail.order}");
    const tabsIndex = detail.indexOf('<Tabs className="evolu-detail__tabs"');
    const tabsListEnd = detail.indexOf("</TabsList>", tabsIndex);
    const summaryIndex = detail.indexOf("<OrderSummaryTab order={detail.order}");
    const tabsClose = detail.indexOf("</Tabs>", tabsIndex);
    const managementIndex = detail.indexOf('<section aria-label="Responsáveis e prazos"');

    expect(headerIndex).toBeGreaterThan(0);
    expect(flowIndex).toBeGreaterThan(headerIndex);
    expect(tabsIndex).toBeGreaterThan(flowIndex);
    expect(tabsListEnd).toBeGreaterThan(tabsIndex);
    expect(summaryIndex).toBeGreaterThan(tabsListEnd);
    expect(tabsClose).toBeGreaterThan(summaryIndex);
    const summaryEnd = detail.indexOf("</TabsContent>", summaryIndex);
    const itemsStart = detail.indexOf('<TabsContent className="evolu-detail__tab-content" value="items">');

    expect(managementIndex).toBeGreaterThan(summaryIndex);
    expect(managementIndex).toBeLessThan(summaryEnd);
    expect(summaryEnd).toBeLessThan(itemsStart);
    expect(tabsClose).toBeGreaterThan(managementIndex);
    expect((detail.match(/<section aria-label="Responsáveis e prazos"/g) ?? []).length).toBe(1);
    expect(detail.slice(summaryIndex, summaryEnd)).toContain("<OrderAssigneesCard");
    expect(detail.slice(summaryIndex, summaryEnd)).toContain("<OrderDeadlinesCard");
    expect(detail.slice(itemsStart, tabsClose)).not.toContain('aria-label="Responsáveis e prazos"');
    expect(detail.slice(summaryIndex, summaryEnd)).toContain('className="evolu-detail__management-grid grid gap-4 xl:grid-cols-2"');
    expect((detail.match(/<OrderFlowProgress order={detail.order} \/>/g) ?? []).length).toBe(1);
  });

  it("keeps domain mutations, permissions and destructive confirmations unchanged", () => {
    for (const key of [
      "getOrderDetail(orderId)",
      "listOrderItems(orderId)",
      "transitionOrderStatus({",
      "createItemOperation(input)",
      "createOrderComment(detail.order.id, text)",
      "recordOrderEvent(",
      "archiveOrderSecure({",
      "deleteOrderPermanently({",
      "cleanupDeletedOrderStorage(result)",
      "hubPermissions.isManager",
      "hubPermissions.canMoveArteBoard",
      "hubPermissions.canMoveProducaoBoard",
    ]) expect(detail).toContain(key);
    expect(detail).toContain("<DeleteOrderDialog");
    expect(detail).toContain("<ArchiveOrderDialog");
    expect(detail).toContain("<OrderEditDialog");
  });

  it("retains status transition controls behind existing props", () => {
    expect(header).toContain("transitions.length > 0");
    expect(header).toContain("onTransition(option.board, option.value)");
    expect(header).toContain("canEdit &&");
    expect(header).toContain("canManage && onArchive && onDelete &&");
    expect(header).toContain("calculateOrderRisk(order)");
    expect(header).toContain("isOrderUrgent(order)");
  });

  it("displays only the official Conta Azul sale number or a truthful missing-number label", () => {
    expect(detail).toContain("formatOfficialOsLabel(detail.order.sale_number)");
    expect(header).toContain("formatOfficialOsLabel(order.sale_number)");
    expect(detail).not.toContain("detail.order.os_number");
    expect(header).not.toContain("order.os_number");
    expect(header).toContain("Cliente não informado");
    expect(header).toContain("Serviço não informado");
  });

  it("uses canonical operational stages and marks the current one accessibly", () => {
    expect(flow).toContain("getOrderOperationalStage(order)");
    expect(flow).toContain('aria-label="Progresso operacional"');
    expect(flow).toContain('aria-current={isCurrent ? "step" : undefined}');
    expect((flow.match(/value: "(ENTRY|ART|APPROVAL|PRODUCTION|FINISHING|READY|LOGISTICS|FINISHED)"/g) ?? []).length).toBe(8);
  });
});
