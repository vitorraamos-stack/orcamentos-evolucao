import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseQuickFilterFromSearch } from "../quickFilterSearch";

const page = readFileSync(new URL("./OrdersCentralPage.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./orders-central.css", import.meta.url), "utf8");

describe("Central de OS — simplified filters", () => {
  it("exposes exactly four approved quick filters", () => {
    const region = page.slice(page.indexOf("const quickFilters:"), page.indexOf("// Preserve existing deep links"));
    expect(region.match(/\["/g)).toHaveLength(4);
    expect(region).toContain('["all", "Todas"]');
    expect(region).toContain('["active", "Em andamento"]');
    expect(region).toContain('["overdue", "Atrasadas"]');
    expect(region).toContain('["finished", "Finalizadas"]');
    expect(region).not.toContain('["urgent", "Urgentes"]');
  });

  it("preserves operational deep links and additional advanced subsets", () => {
    for (const key of ["today", "tomorrow", "week", "pending", "urgent"]) {
      expect(parseQuickFilterFromSearch(`?quick=${key}`)).toBe(key);
    }
    expect(page).toContain("extraQuickFilters.map(([value, label])");
    expect(page).toContain('aria-label="Outros recortes operacionais"');
  });

  it("uses a mobile bottom sheet and a desktop popover", () => {
    expect(page).toContain("useIsMobile()");
    expect(page).toContain('SheetContent side="bottom"');
    expect(page).toContain('onOpenChange={handleFiltersOpenChange}');
    expect(page).toContain("<PopoverContent");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });

  it("separates draft changes from applied filters", () => {
    expect(page).toContain("hasDraftChanges");
    expect(page).toContain("Alterações não aplicadas");
    expect(page).toContain("setDraftQuick(quick)");
    expect(page).toContain("setQuick(draftQuick)");
    expect(page).toContain("Cancelar");
    expect(page).toContain("clearDraftFilters");
  });

  it("uses the urgent summary as a distinct quick-result shortcut", () => {
    expect(page).toContain('quick === "urgent"');
    expect(page).toContain("Exibindo: Urgentes");
    expect(page).toContain("Voltar a Todas");
    expect(page).toContain("onSelectUrgent={() => {");
  });
});
