import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layout = readFileSync(new URL("./Layout.tsx", import.meta.url), "utf8");
const shellStyles = readFileSync(new URL("./evolusystem-shell.css", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../modules/dashboard/OperationalDashboardPage.tsx", import.meta.url), "utf8");
const login = readFileSync(new URL("../pages/Login.tsx", import.meta.url), "utf8");

describe("EvoluSystem premium shell", () => {
  it("uses updated branding and keeps responsive navigation", () => {
    expect(layout).toContain("Controle Operacional");
    expect(layout).not.toContain("Evolução OS 2.0");
    expect(layout).toContain("evolu-shell__navigation min-h-0 flex-1 overflow-y-auto");
    expect(layout).toContain("setMobileOpen(false)");
  });

  it("shows the official EvoluSystem SVG in desktop and mobile sidebars", () => {
    const sidebarBrands = layout.match(/src="\/evolusystem-logo-dark\.svg"/g) ?? [];
    expect(sidebarBrands).toHaveLength(2);
    expect(layout).not.toContain('src="/logo-branca.png"');
    expect(layout).not.toContain("evolu-shell__company-logo");
    expect(layout).not.toContain("evolu-shell__brand-description");
    expect(layout).not.toContain("evolu-shell__cmyk");
    expect(shellStyles).toContain("evolu-shell__brand-logo");
    expect(shellStyles).not.toContain("evolu-shell__company-logo");
    expect(login).toContain('src="/evolusystem-logo-dark.svg"');
    expect(login).not.toContain('src="/evolusystem-logo.svg"');
    expect(login).not.toContain('src="/logo-branca.png"');
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
    expect(layout).toContain('canAccessOperationalSection(access, "orders")');
    expect(layout).toContain('canAccessOperationalSection(access, "dashboard")');
    expect(layout).toContain('canAccessOperationalSection(access, "art")');
    expect(layout).toContain('canAccessOperationalSection(access, "production")');
    expect(layout).toContain('hasModuleAccess("calculadora")');
    expect(layout).toContain("getOperationalNavState(location)");
    expect(layout).toContain("isArtworkCentralPage ||");
    expect(layout).toContain("isProductionCentralPage ||");
  });

  it("keeps dashboard access read-only and preserves login recovery contracts", () => {
    expect(dashboard).toContain('canAccessOperationalSection({ hasModuleAccess, permissions: hubPermissions }, "dashboard")');
    expect(dashboard).toContain("listDashboardOrders(controller.signal)");
    expect(dashboard).toContain("buildDashboardOverview(rows, now)");
    expect(dashboard).toContain("listDashboardAssignees(");
    expect(dashboard).toContain("REFRESH_INTERVAL = 120_000");
    expect(login).toContain("supabase.auth.resetPasswordForEmail(email.trim()");
  });
});
