import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../../supabase/migrations/20261006220851_pricing_admin_17b_configurable_parameters.sql",
    import.meta.url
  ),
  "utf8"
);

describe("17B configurable parameters migration", () => {
  it("creates server-only parameter and installation tables with RLS", () => {
    for (const table of [
      "product_costing_parameters",
      "costing_configuration_audit_events",
      "pricing_installation_settings",
    ]) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toMatch(/revoke all on table[\s\S]*from public, anon, authenticated, service_role/i);
  });

  it("uses revision guards and append-only Costing audit", () => {
    expect(sql).toContain("COSTING_PARAMETER_REVISION_CONFLICT");
    expect(sql).toContain("COSTING_CONFIGURATION_AUDIT_APPEND_ONLY");
    expect(sql).toMatch(/for update/i);
  });

  it("keeps admin RPCs unavailable to browser roles", () => {
    expect(sql).toMatch(
      /revoke execute on function public\.costing_upsert_product_parameter_secure[\s\S]*from public, anon, authenticated/i
    );
    expect(sql).toMatch(
      /revoke execute on function public\.pricing_set_installation_settings_secure[\s\S]*from public, anon, authenticated/i
    );
  });

  it("does not grant destructive service_role privileges", () => {
    expect(sql).not.toMatch(/grant[^;]*(?:delete|truncate|references|trigger|maintain)[^;]*to service_role/i);
  });

  it("supports first-write configuration without product-dependent seeds", () => {
    expect(sql).toContain("costing_upsert_product_parameter_secure");
    expect(sql).toContain("if p_expected_revision is not null then");
    expect(sql).toContain("CREATE_PRODUCT_PARAMETER");
    expect(sql).toContain("CREATE_INSTALLATION_SETTINGS");
    expect(sql).toContain("Business values are intentionally not seeded here.");
    expect(sql).not.toContain("where p.code = 'LETREIRO_PVC'");
  });
});
