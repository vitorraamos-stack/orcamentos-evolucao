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

  it("uses canonical operational stages and marks the current one accessibly", () => {
    expect(flow).toContain("getOrderOperationalStage(order)");
    expect(flow).toContain('aria-label="Progresso operacional"');
    expect(flow).toContain('aria-current={isCurrent ? "step" : undefined}');
    expect((flow.match(/value: "(ENTRY|ART|APPROVAL|PRODUCTION|FINISHING|READY|LOGISTICS|FINISHED)"/g) ?? []).length).toBe(8);
  });
});
