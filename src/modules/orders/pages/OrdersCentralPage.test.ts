import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseQuickFilterFromSearch } from "../quickFilterSearch";

const source = readFileSync(
  new URL("./OrdersCentralPage.tsx", import.meta.url),
  "utf8"
);

describe("OrdersCentralPage dedicated creation entry", () => {
  it.each([
    ["?quick=active", "active"],
    ["?quick=overdue", "overdue"],
    ["?quick=today", "today"],
    ["?quick=tomorrow", "tomorrow"],
    ["?quick=INVALID", "all"],
  ])("parses the quick deep link %s", (search, expected) => {
    expect(parseQuickFilterFromSearch(search)).toBe(expected);
  });

  it("synchronizes and clears the quick URL parameter without reload", () => {
    expect(source).toContain('url.searchParams.delete("quick")');
    expect(source).toContain('url.searchParams.set("quick", quick)');
    expect(source).toContain("window.history.replaceState");
  });
  it("shows a permission-protected button that preserves the central as origin", () => {
    expect(source).toContain("hubPermissions.canCreateOs &&");
    expect(source).toContain("+ Nova OS");
    expect(source).toContain('setLocation(createOrderPath("/os"))');
  });

  it("does not open a creation dialog or navigate to a newly-created detail", () => {
    expect(source).not.toContain("CreateOSDialog");
    expect(source).not.toContain("`/os/${order.id}`");
  });

  it("keeps quick filters, reset and one-page pagination behavior visible", () => {
    expect(source).toContain('["urgent", "Urgentes"]');
    expect(source).toContain('["finished", "Finalizadas"]');
    expect(source).toContain("clearFilters");
    expect(source).toContain("pages > 1");
    expect(source).toContain("Mostrando {orders.length} de {total} ordens");
  });

  it("keeps popover edits in drafts until filters are applied", () => {
    expect(source).toMatch(
      /const \[draftQuick, setDraftQuick\] =\s+useState<QuickOrderFilter>/
    );
    expect(source).toContain("onOpenChange={handleFiltersOpenChange}");
    expect(source).toContain("setDraftQuick(quick)");
    expect(source).toContain(
      "<Select value={draftArtStatus} onValueChange={setDraftArtStatus}>"
    );
    expect(source).toContain("<Button onClick={applyDraftFilters}>");
  });

  it("applies drafts together and resets pagination", () => {
    const applyBody = source.slice(
      source.indexOf("const applyDraftFilters"),
      source.indexOf("const load")
    );
    expect(applyBody).toContain("setQuick(draftQuick)");
    expect(applyBody).toContain("setArtStatus(draftArtStatus)");
    expect(applyBody).toContain("setPage(1)");
    expect(applyBody).toContain("setFiltersOpen(false)");
  });

  it("discards unapplied drafts on close and restores applied values on reopen", () => {
    const openHandler = source.slice(
      source.indexOf("const handleFiltersOpenChange"),
      source.indexOf("const clearDraftFilters")
    );
    expect(openHandler).toContain("if (open)");
    expect(openHandler).toContain("setDraftPriority(priority)");
    expect(openHandler).toContain("setDraftLogistics(logistics)");
    expect(openHandler).toContain("setFiltersOpen(open)");
  });

  it("clears only drafts inside the popover and resets page when a chip is removed", () => {
    expect(source).toContain(
      '<Button variant="ghost" onClick={clearDraftFilters}>'
    );
    expect(source).toMatch(/chip\.clear\(\);\s+setPage\(1\);/);
    expect(source).toContain(
      '<Button variant="ghost" size="sm" onClick={clearFilters}>'
    );
  });
});
