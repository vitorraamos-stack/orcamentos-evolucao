import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../../supabase/migrations/20261005165041_costing_service_boundary.sql",
    import.meta.url
  ),
  "utf8"
);

describe("Costing service-boundary migration", () => {
  it("defines four invoker RPCs with a fixed search path and service-only execution", () => {
    for (const name of [
      "costing_create_resource_secure",
      "costing_update_resource_secure",
      "costing_set_current_rate_secure",
      "costing_get_rate_series_secure",
    ])
      expect(sql).toContain(`function public.${name}`);
    expect(sql.match(/security invoker/g)).toHaveLength(4);
    expect(sql.match(/set search_path = pg_catalog, public/g)).toHaveLength(4);
    expect(sql).not.toMatch(/security definer|\bexecute\s+format|quote_ident/i);
    expect(sql).toMatch(
      /revoke execute[\s\S]*from public, anon, authenticated/i
    );
    expect(sql).toMatch(/grant execute[\s\S]*to service_role/i);
  });
  it("locks resources and open rates and keeps decimal output textual", () => {
    expect(sql.match(/for update/g)?.length).toBeGreaterThanOrEqual(8);
    expect(sql).toContain("set effective_to=p_effective_from");
    expect(sql).toContain("'BRL',resource_unit");
    expect(sql.match(/amount::text/g)?.length).toBeGreaterThanOrEqual(5);
  });
  it("contains no dynamic SQL or table grant changes", () => {
    expect(sql).not.toMatch(
      /\bexecute\b(?!\s+on)|format\s*\(|grant\s+(select|insert|update|delete)/i
    );
  });
});
