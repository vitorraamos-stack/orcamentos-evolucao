import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./OrdersCentralPage.tsx", import.meta.url), "utf8");

describe("Central de OS — independent queries and recovery contracts", () => {
  it("invalidates list requests immediately, before 350ms search debounce", () => {
    const handler = page.slice(page.indexOf("const handleSearchChange"), page.indexOf("const clearFilters"));
    expect(handler).toContain("invalidateList();");
    expect(handler).toContain("setSearch(value)");
    expect(handler).toContain("setSearchEditVersion");
    expect(page).toContain("setSearchCommittedVersion(searchEditVersion)");
    expect(page).toContain("searchEditVersion !== searchCommittedVersion");
  });

  it("ignores superseded query results, errors and loading completion", () => {
    expect(page).toContain("if (requestId !== listRequestId.current) return;");
    expect(page).toContain("if (requestId === listRequestId.current) setLoading(false)");
    expect(page).toContain("listRequestId.current += 1");
  });

  it("does not show stale totals on failures or during loading", () => {
    expect(page).toContain("useState<number | null>(null)");
    expect(page).toContain("setTotal(null)");
    expect(page).toContain("total === null");
    expect(page).toContain("total !== null");
  });

  it("keeps filter controls outside the list-only loading and error conditions", () => {
    expect(page.indexOf('aria-label="Filtros rápidos"'))
      .toBeLessThan(page.indexOf("<OrdersListRecovery"));
    expect(page.indexOf("<OrderSearch value={search}"))
      .toBeLessThan(page.indexOf("<OrdersLoading />"));
    expect(page).toContain("setPage(result.page)");
  });

  it("supports independent indicator retry and manual coordinated refresh", () => {
    expect(page).toContain("onRetry={refreshSummary}");
    expect(page).toContain("const refreshAll = () =>");
    expect(page).toContain("refreshSummary();");
    expect(page).toContain("setListRefreshKey");
    expect(page).toContain('aria-disabled={loading || summaryStatus === "loading"}');
  });

  it("restores focus only after a keyboard-focused recovery succeeds", () => {
    expect(page).toContain("document.activeElement === retryButtonRef.current");
    expect(page).toContain("resultsHeadingRef.current?.focus({ preventScroll: true })");
    expect(page).toContain("focusResultsAfterRetry.current = false");
  });
});
