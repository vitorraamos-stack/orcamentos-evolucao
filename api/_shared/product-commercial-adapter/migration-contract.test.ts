import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const sql = readFileSync(
  "supabase/migrations/20261020115833_product_commercial_adapter_31b.sql",
  "utf8"
);

describe("31B minimal published content permission", () => {
  it("grants service_role only publication columns", () => {
    expect(sql).toMatch(/grant select \(product_id, version, content, published_at\)/i);
    expect(sql).toMatch(/on table public\.library_publications to service_role/i);
    expect(sql).not.toMatch(/grant .*authenticated|grant .*anon/i);
  });
  it("never changes draft or pricing persistence", () => {
    // Ignore explanatory comments: security checks must inspect SQL statements.
    const statements = sql.split("\n")
      .filter(line => !line.trim().startsWith("--")).join("\n");
    expect(statements).not.toMatch(/insert into|update public|delete from|create policy/i);
    expect(statements).not.toContain("library_product_history");
    expect(statements).not.toMatch(/grant\s+[^;]*\bdraft\b/i);
  });
});
