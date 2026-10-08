import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layout = readFileSync(new URL("./Layout.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../modules/dashboard/OperationalDashboardPage.tsx", import.meta.url), "utf8");
const login = readFileSync(new URL("../pages/Login.tsx", import.meta.url), "utf8");

describe("EvoluSystem premium shell", () => {
  it("uses updated branding and keeps responsive navigation", () => {
    expect(layout).toContain("Controle Operacional");
    expect(layout).not.toContain("Evolução OS 2.0");
    expect(layout).toContain("evolu-shell__navigation min-h-0 flex-1 overflow-y-auto");
    expect(layout).toContain("setMobileOpen(false)");
  });

  it("keeps account identification in the sidebar and a compact mobile-only header", () => {
    const header = layout.slice(
      layout.indexOf('<header className="evolu-shell__topbar'),
      layout.indexOf("</header>") + "</header>".length
    );
    expect(header).toContain("md:hidden");
    expect(header).toContain("h-14");
    expect(header).not.toContain("evolu-shell__topbar-avatar");
    expect(header).not.toContain("activePageLabel");
    expect(header).not.toContain("lg:block");
    expect(layout).toContain('className="evolu-shell__account px-3 py-4"');
    expect(layout).toContain("md:p-5 xl:p-6");
  });

  it("preserves permission gates and operational section routing", () => {
    expect(layout).toContain('hubPermissions.canViewHubOS');
    expect(layout).toContain('hasModuleAccess("hub_os")');
    expect(layout).toContain('hasModuleAccess("calculadora")');
    expect(layout).toContain("getOperationalNavState(location)");
    expect(layout).toContain("isArtworkCentralPage ||");
    expect(layout).toContain("isProductionCentralPage ||");
  });

  it("does not change dashboard data contracts or recovery calls", () => {
    expect(dashboard).toContain("getOperationalDashboardMetrics(range)");
    expect(dashboard).toContain("getOperationalAttentionMetrics()");
    expect(dashboard).toContain("listOperationalAttentionOrders(8)");
    expect(dashboard).toContain("aria-pressed={period === value}");
    expect(login).toContain("supabase.auth.resetPasswordForEmail(email.trim()");
  });
});
