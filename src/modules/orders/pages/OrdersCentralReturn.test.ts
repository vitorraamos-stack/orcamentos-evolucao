import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("./OrdersCentralPage.tsx", import.meta.url), "utf8");
const detail = readFileSync(new URL("./OrderDetailPage.tsx", import.meta.url), "utf8");
const table = readFileSync(new URL("../components/OrderTable.tsx", import.meta.url), "utf8");
const deadline = readFileSync(new URL("../centralReturnDeadline.ts", import.meta.url), "utf8");

describe("Central de OS — one-shot intelligent return", () => {
  it("captures origin only from direct same-tab OS links", () => {
    expect(table).toContain("isSameTabOrderActivation(event.nativeEvent)");
    expect(table).toContain("onOpenOrder?.(orderId)");
    expect(table).toContain('data-central-order-id={order.id}');
    expect(page).toContain("saveCentralReturn(centralSessionStorage()");
    expect(detail).toContain("markCentralDetailEntered(centralSessionStorage()");
  });
  it("restores filter and page context without exposing search in URL", () => {
    for (const item of ["search", "quick", "artStatus", "prodStatus", "priority", "logistics", "page"]) {
      expect(page).toContain(`returnContext?.${item}`);
    }
    expect(page).toContain("consumeCentralReturn(centralSessionStorage(), returnContext)");
    expect(page).toContain("clearCentralReturn(centralSessionStorage())");
  });
  it("bounds one location attempt and prevents delayed navigation", () => {
    expect(page).toContain("RETURN_LOOKUP_TIMEOUT_MS = 5000");
    expect(deadline).toContain("controller.abort()");
    expect(deadline).toContain("Promise.race([lookup, timeout])");
    expect(page).toContain("locateOrderId: returnTarget, signal: controller.signal");
    expect(page).toContain("if (requestId !== listRequestId.current) return;");
    expect(page).toContain("return await listOperationalOrders(args)");
    expect(page).toContain("returnOrderIdRef.current = null");
  });
  it("highlights and focuses the matching order only once", () => {
    expect(page).toContain("result.locatedOrderId === returnTarget");
    expect(page).toContain("pendingAnchorFocusRef.current = null");
    expect(page).toContain('document.querySelectorAll<HTMLElement>("[data-central-order-id]")');
    expect(table).toContain("highlightOrderId === order.id");
  });
});
