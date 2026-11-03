import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detail = readFileSync(new URL("./OrderDetailPage.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./order-detail-premium.css", import.meta.url), "utf8");
const logistics = readFileSync(new URL("../components/OrderInstallationTab.tsx", import.meta.url), "utf8");

describe("EvoluSystem OS tabs â€” reliable loading and error recovery", () => {
  it("preserves the mounted editor during refreshes of the same OS", () => {
    expect(detail).toContain("if ((loading && !detail) || viewOrderId !== orderId");
    expect(detail).toContain("detail.order.id !== orderId");
    expect(detail).toContain("readCoordinator.current.isCurrent(ticket)");
  });

  it("isolates paginated history from stale reads and switches between orders", () => {
    expect(detail).toContain('readCoordinator.current.begin(orderId, "history-more")');
    expect(detail).toContain("if (!readCoordinator.current.isCurrent(ticket)) return;");
    expect(detail).toContain("setActivities(previous => readCoordinator.current.isCurrent(ticket)");
    expect(detail).toContain("setHasMoreHistory(more.length === 100)");
    expect(detail).toContain("setHasMoreHistory(false)");
    expect(detail).toContain("setLoadingMoreHistory(false)");
    expect(detail).toContain('hasMore={hasMoreHistory}');
  });

  it("only skips previously successful tabs; retries failed tabs on reentry", () => {
    expect(detail).toContain¶»§q«^