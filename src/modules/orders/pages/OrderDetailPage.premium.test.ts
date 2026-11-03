import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detail = readFileSync(new URL("./OrderDetailPage.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../components/OrderHeader.tsx", import.meta.url), "utf8");
const flow = readFileSync(new URL("../components/OrderFlowProgress.tsx", import.meta.url), "utf8");

describe("EvoluSystem â€” OS detail premium visual contract", () => {
  it("adds a return breadcrumb and seven navigable tab sections", () => {
    expect(detail).toContain('href="/os"');
    expect(detail).toContain("Voltar Ã  Central de OS");
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
    const tabs¶»§q«^