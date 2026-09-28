import { describe, expect, it } from "vitest";
import { getHubPermissions, normalizeRole } from "./hubRoles";

describe("hubRoles", () => {
  it("normaliza admin legado para gerente", () => {
    expect(normalizeRole("admin")).toBe("gerente");
  });

  it("permite gestão de usuários apenas para gerente/admin", () => {
    expect(getHubPermissions("gerente").canManageUsers).toBe(true);
    expect(getHubPermissions("admin").canManageUsers).toBe(true);
    expect(getHubPermissions("producao").canManageUsers).toBe(false);
  });
});

describe("phase 4 logistics permissions", () => {
  it("separates management and execution capabilities", () => {
    expect(getHubPermissions("gerente")).toMatchObject({
      canViewInstallations: true,
      canManageInstallations: true,
      canExecuteInstallations: true,
      canViewDeliveries: true,
      canManageDeliveries: true,
    });
    expect(getHubPermissions("instalador")).toMatchObject({
      canViewInstallations: true,
      canManageInstallations: false,
      canExecuteInstallations: true,
      canViewDeliveries: true,
      canManageDeliveries: false,
    });
    expect(getHubPermissions("producao")).toMatchObject({
      canViewInstallations: true,
      canManageInstallations: false,
      canExecuteInstallations: false,
      canViewDeliveries: true,
      canManageDeliveries: true,
    });
  });
});
