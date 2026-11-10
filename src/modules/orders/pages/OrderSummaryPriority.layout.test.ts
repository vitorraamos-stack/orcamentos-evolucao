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

  it("gives only the products card a subtle, theme-aware emphasis", () => {
    expect(extras).toContain('className="evolu-detail__products-card min-w-0"');
    expect(extras).toContain("Produtos da OS");
    expect(styles).toContain(".evolu-detail__tab-content .evolu-detail__products-card");
    expect(styles).toContain(".dark .evolu-detail__tab-content .evolu-detail__products-card");
    expect(styles).toContain("border-left: 3px solid #168fce;");
  });
});
