import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL(
    "../../supabase/migrations/20261005151201_costing_service_role_privilege_hardening.sql",
    import.meta.url
  )
);
const sql = readFileSync(migrationPath, "utf8");
const normalized = sql.replace(/\s+/g, " ").toLowerCase();

const costingTables = [
  "material_definitions",
  "process_definitions",
  "outsourced_service_definitions",
  "fixed_cost_definitions",
  "material_cost_rates",
  "process_cost_rates",
  "outsourced_service_cost_rates",
  "fixed_cost_rates",
] as const;

const serviceRoleRevoke = normalized.match(
  /revoke all on table ([^;]+) from service_role;/
)?.[1];
const serviceRoleGrant = normalized.match(
  /grant select, insert, update on table ([^;]+) to service_role;/
)?.[1];

describe("costing service_role privilege hardening migration", () => {
  it("revokes all existing service_role table privileges before granting the runtime minimum", () => {
    expect(serviceRoleRevoke).toBeDefined();
    expect(serviceRoleGrant).toBeDefined();
    expect(normalized.indexOf("revoke all on table")).toBeLessThan(
      normalized.indexOf("grant select, insert, update on table")
    );

    for (const table of costingTables) {
      expect(serviceRoleRevoke).toContain(`public.${table}`);
      expect(serviceRoleGrant).toContain(`public.${table}`);
    }
  });

  it("leaves service_role with no DELETE, TRUNCATE, REFERENCES, TRIGGER, or MAINTAIN grant", () => {
    for (const privilege of [
      "delete",
      "truncate",
      "references",
      "trigger",
      "maintain",
    ]) {
      expect(normalized).not.toMatch(
        new RegExp(`grant[^;]*\\b${privilege}\\b[^;]*to service_role;`)
      );
    }

    // REVOKE ALL followed by the explicit grant makes TRUNCATE false in the
    // intended post-migration ACL (equivalent to has_table_privilege(..., 'TRUNCATE') = false).
    expect(serviceRoleRevoke).toBeDefined();
    expect(serviceRoleGrant).not.toContain("truncate");
  });

  it("does not expand browser-role access", () => {
    expect(normalized).toContain("from public, anon, authenticated;");
    expect(normalized).not.toMatch(/grant[^;]*to (?:public|anon|authenticated);/);
  });
});
