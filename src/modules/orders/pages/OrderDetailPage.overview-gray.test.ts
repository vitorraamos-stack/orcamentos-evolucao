import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detail = readFileSync(new URL("./OrderDetailPage.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./order-detail-premium.css", import.meta.url), "utf8");

describe("OS detail: accessible slate visual hierarchy", () => {
  it("preserves editable operations while integrating guidance into the flow card", () => {
    expect(detail).toContain('className="evolu-detail__overview"');
    expect(detail).toContain('className="evolu-detail__flow-panel"');
    expect(detail).toContain("<OrderHeader ");
    expect(detail).toContain("<OrderFlowProgress ");
    expect(detail).toContain("<OrderOrientationStrip ");
    expect(detail).toContain('className="evolu-detail__tabs-scroll overflow-x-auto"');
    expect((detail.match(/<TabsTrigger className="evolu-detail__tab"/g) ?? [])).toHaveLength(7);
  });

  it("distinguishes page, cards, interactive elements and semantics", () => {
    for (const value of ["--os-page: var(--evolu-page);", "--os-card: var(--evolu-panel);",
      "--os-card-raised: var(--evolu-panel-raised);", "--os-text: var(--evolu-text);",
      "--os-muted: var(--evolu-text-muted);", "background: var(--evolu-action-bg);",
      '[data-tone="success"]', '[data-tone="warning"]', '[data-tone="danger"]']) {
      expect(styles).toContain(value);
    }
    expect(styles).toContain(".dark .evolu-detail__quick-info-item");
    expect(styles).toContain("grid-template-columns: repeat(4, minmax(0, 1fr));");
    expect(styles).toContain(".dark .evolu-detail__flow-panel {");
    expect(styles).toContain(".dark .evolu-detail__summary-columns {");
  });

  it("has legible mobile fallbacks and visible keyboard focus", () => {
    expect(styles).toContain("@media (max-width: 1050px)");
    expect(styles).toContain("@media (max-width: 700px)");
    expect(styles).toContain("@media (max-width: 420px)");
    expect(styles).toContain(".dark .evolu-detail__tab:focus-visible");
    expect(styles).toContain(".dark .evolu-detail__section-card [data-slot=\"select-trigger\"]:focus-visible");
  });
});
