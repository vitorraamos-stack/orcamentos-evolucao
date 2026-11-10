import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detail = readFileSync(new URL("./OrderDetailPage.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./order-detail-premium.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../../components/Layout.tsx", import.meta.url), "utf8");
const shellStyles = readFileSync(new URL("../../../components/evolusystem-shell.css", import.meta.url), "utf8");

describe("Order detail wide workspace and scrolling", () => {
  it("uses the available width without affecting the central list", () => {
    expect(shell).toContain("isOrderDetailPage ||");
    expect(detail).toContain('className="evolu-detail w-full min-w-0 space-y-3 pb-8"');
    expect(detail).toContain("xl:grid-cols-[minmax(0,1.85fr)_minmax(320px,1fr)]");
    expect(styles).toContain("max-width: none;");
  });

  it("uses one main workspace scroll while keeping independent sidebar navigation", () => {
    expect(shell).toContain('isOrderDetailPage ? "overflow-y-auto overflow-x-hidden"');
    expect(shell).toContain('isOrderDetailPage && "evolu-shell--order-detail h-dvh overflow-hidden"');
    expect(shellStyles).toContain("body:has(.evolu-shell--order-detail)");
    expect(shellStyles).toContain("overscroll-behavior-y: contain;");
    expect(shell).toContain('evolu-shell__navigation min-h-0 flex-1 overflow-y-auto');
  });

  it("unpins tabs and hides inactive mounted editors", () => {
    expect(styles).toMatch(/\.evolu-detail__tabs-scroll\s*\{\s*position:\s*static;/);
    expect(styles).not.toMatch(/\.evolu-detail__tabs-scroll\s*\{[^}]*position:\s*sticky;/);
    expect(styles).toMatch(/\[data-slot="tabs-content"\]\[data-state="inactive"\]\s*\{\s*display:\s*none;/);
    expect(detail).toContain('forceMount className="evolu-detail__tab-content" value="items"');
    expect(detail).toContain('forceMount className="evolu-detail__tab-content" value="comments"');
  });
});
