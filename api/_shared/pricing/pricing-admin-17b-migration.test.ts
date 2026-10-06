import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../../supabase/migrations/20261006204823_pricing_admin_17b_configurable_parameters.sql",
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
      /revoke execute on function public\.costing_set_product_parameter_secure[\s\S]*from public, anon, authenticated/i
    );
    expect(sql).toMatch(
      /revoke execute on function public\.pricing_set_installation_settings_secure[\s\S]*from public, anon, authenticated/i
    );
  });

  it("does not grant destructive service_role privileges", () => {
    expect(sql).not.toMatch(/grant[^;]*(?:delete|truncate|references|trigger|maintain)[^;]*to service_role/i);
  });

  it("seeds only the approved LETREIRO_PVC pilot values", () => {
    expect(sql).toContain("where p.code = 'LETREIRO_PVC'");
    expect(sql).toContain("'paint_coats'");
    expect(sql).toContain("'paint_yield_m2_per_can_per_coat'");
    expect(sql).toMatch(/select 1, 1, 150, 2, 180, 200, 375, 4/);
  });
});
