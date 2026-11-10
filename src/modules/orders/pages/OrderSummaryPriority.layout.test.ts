import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./OrderDetailPage.tsx", import.meta.url), "utf8");
const extras = readFileSync(new URL("../components/OrderSummaryExtras.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./order-detail-premium.css", import.meta.url), "utf8");

describe("OS summary hierarchy", () => {
  it("shows products before complementary information within the same summary column", () => {
    const tab = page.indexOf('value="summary">');
    const products = page.indexOf("<OrderSummaryExtras ", tab);
    const briefing = page.indexOf("<OrderArtBriefingCard order={detail.order} />", tab);
    const complementary = page.indexOf("<OrderSummaryTab order={detail.order} />", tab);
    const assignments = page.indexOf('aria-label="Responsáveis e prazos"', tab);
    expect(tab).toBeGreaterThan(-1);
    expect(products).toBeGreaterThan(tab);
    expect(briefing).toBeGreaterThan(products);
    expect(complementary).toBeGreaterThan(briefing);
    expect(assignments).toBeGreaterThan(complementary);
  });

  it("sets the same #1C2935 section header on all five summary cards", () => {
    const paths = [
      "../components/OrderSummaryExtras.tsx",
      "../components/OrderArtBriefingCard.tsx",
      "../components/OrderSummaryTab.tsx",
      "../components/OrderDeadlinesCard.tsx",
      "../components/OrderAssigneesCard.tsx",
    ] as const;
    for (const path of paths) {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      expect(source).toContain("evolu-detail__section-card");
      expect(source).toContain("evolu-detail__section-header");
      expect((source.match(/evolu-detail__section-header/g) ?? []).length).toBe(1);
    }
    expect(styles).toContain("background: #1c2935;");
    expect(styles).toContain("color: #f8fafc;");
    expect(styles).toContain("color: #cbd5e1;");
    expect(styles).toContain(".dark .evolu-detail .evolu-detail__tab-content .evolu-detail__section-card");
    expect(styles).toContain("padding-block: 0;");
    expect(styles).toContain("gap: 0;");
  });

  it("gives only the products card a subtle, theme-aware emphasis", () => {
    expect(extras).toContain('className="evolu-detail__products-card evolu-detail__section-card min-w-0"');
    expect(extras).toContain("Produtos da OS");
    expect(styles).toContain(".evolu-detail__tab-content .evolu-detail__products-card");
    expect(styles).toContain(".dark .evolu-detail__tab-content .evolu-detail__products-card");
    expect(styles).toContain("border-left: 3px solid #168fce;");
  });
});
