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
