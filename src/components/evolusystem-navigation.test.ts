import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layout = readFileSync(new URL("./Layout.tsx", import.meta.url), "utf8");

describe("EvoluSystem sidebar navigation groups", () => {
  it("presents operational stages in the same order as work progresses", () => {
    const orderedRoutes = ["/hub-os", "/os", "/os/arte", "/os/producao", "/instalacoes", "/entregas"];
    const positions = orderedRoutes.map(route => layout.indexOf(`href: "${route}"`));
    expect(positions.every(position => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(layout).toContain("active: operationalNav.orders");
    expect(layout).toContain("active: operationalNav.art");
    expect(layout).toContain("active: operationalNav.production");
  });

  it("groups links by their purpose rather than using an unspecific module group", () => {
    const sections = ["Operação", "Comercial", "Recursos", "Administração"];
    const positions = sections.map(section => layout.indexOf(`<SectionLabel>${section}</SectionLabel>`));
    expect(positions.every(position => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(layout).not.toContain("<SectionLabel>Outros módulos</SectionLabel>");
    expect(layout).toContain("<h2 className=\"evolu-nav__section");
  });

  it("keeps permission gates for every group and module", () => {
    expect(layout).toContain("hubPermissions.canViewHubOS && hasModuleAccess(\"hub_os\")");
    expect(layout).toContain("canViewOrcamentista =");
    expect(layout).toContain("hubPermissions.canCreateOs && canViewCalculadora");
    expect(layout).toContain('isAdmin && hasModuleAccess("materiais")');
    expect(layout).toContain('hubPermissions.canManageUsers && hasModuleAccess("configuracoes")');
    expect(layout).toContain('hasModuleAccess("hub_os_financeiro")');
    expect(layout).toContain("hubPermissions.canViewInstallations");
    expect(layout).toContain("hubPermissions.canViewDeliveries");
    expect(layout).toContain("hasCommercialModules &&");
    expect(layout).toContain("hasResourceModules &&");
    expect(layout).toContain("hasManagementModules &&");
  });

  it("shares the same NavItems between desktop and mobile menus", () => {
    expect(layout.match(/<NavItems \/>/g)).toHaveLength(2);
    expect(layout).toContain("setMobileOpen(false)");
  });
});
