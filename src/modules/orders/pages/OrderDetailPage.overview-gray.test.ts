import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detail = readFileSync(new URL("./OrderDetailPage.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./order-detail-premium.css", import.meta.url), "utf8");

describe("OS overview: softer dark-theme surfaces", () => {
  it("keeps the existing header, flow, orientation and tabs structure", () => {
    expect(detail).toContain('className="evolu-detail__overview"');
    expect(detail).toContain("<OrderHeader ");
    expect(detail).toContain("<OrderFlowProgress ");
    expect(detail).toContain("<OrderOrientationStrip ");
    expect(detail).toContain('className="evolu-detail__tabs-scroll overflow-x-auto"');
  });

  it("lightens only the overview-related dark surfaces", () => {
    expect(styles).toContain("--os-overview-surface: #1c2935;");
    expect(styles).toContain("--os-overview-band: #192632;");
    expect(styles).toContain(".dark .evolu-detail__overview,");
    expect(styles).toContain(".dark .evolu-detail__orientation,");
    expect(styles).toContain(".dark .evolu-detail__tabs-scroll {");
    expect(styles).toContain(".dark .evolu-detail__overview .evolu-detail__hero-main {");
    expect(styles).toContain(".dark .evolu-detail__overview .evolu-detail__quick-info {");
  });

  it("keeps summary cards and the light-theme palette untouched", () => {
    expect(styles).toContain('.evolu-detail__tab-content [data-slot="card"]');
    expect(styles).toContain(".dark .evolu-detail__tab-content .evolu-detail__products-card");
    const added = styles.slice(styles.indexOf("/* OS overview only: slightly lighter neutral slate"));
    expect(added).not.toContain(".evolu-detail__management-grid");
    expect(added).not.toContain(".evolu-detail__products-card");
  });
});
