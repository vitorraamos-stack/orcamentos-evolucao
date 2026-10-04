import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../../supabase/migrations/20261004204613_product_engineering_create_version.sql",
    import.meta.url
  ),
  "utf8"
).toLowerCase();

describe("product engineering create-version migration", () => {
  it("serializes numbering on the product and checks the published source", () => {
    expect(sql).toContain("security invoker");
    expect(sql).toMatch(/from public\.products[\s\S]*?for update/);
    expect(sql).toContain("v_source.status <> 'published'");
    expect(sql).toContain("v_source.revision <> p_expected_revision");
    expect(sql).toMatch(/max\(version_number\)[\s\S]*?\+ 1/);
  });

  it("creates a fresh draft and performs complete DB-to-DB child clones", () => {
    expect(sql).toMatch(/'draft', 1,[\s\S]*?null, null/);
    for (const table of [
      "product_inputs",
      "product_variables",
      "product_components",
    ]) {
      expect(sql).toContain(`insert into public.${table} (`);
      expect(sql).toContain(`from public.${table}`);
    }
    expect(sql).toContain("ids are intentionally omitted");
    expect(sql).toContain("decimal_default, decimal_min, decimal_max");
  });

  it("exposes execution only to the server role", () => {
    for (const role of ["public", "anon", "authenticated"])
      expect(sql).toContain(`from ${role};`);
    expect(sql).toContain("to service_role;");
  });
});
