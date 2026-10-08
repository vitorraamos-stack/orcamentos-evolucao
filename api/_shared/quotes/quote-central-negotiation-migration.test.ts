import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261008153453_quote_list_pricing_mode_18j.sql",
  "utf8"
).replaceAll("\r\n", "\n");

describe("Quote Central negotiation migration 18J", () => {
  it("keeps quote_list_secure as stable SECURITY INVOKER with a fixed search_path", () => {
    expect(migration).toMatch(/language\s+sql/i);
    expect(migration).toMatch(/stable\s+security\s+invoker/i);
    expect(migration).toMatch(
      /set\s+search_path\s*=\s*pg_catalog,\s*public/i
    );
    expect(migration).not.toMatch(/security\s+definer/i);
  });

  it("returns only the sanitized pricing mode", () => {
    expect(migration).toContain(
      "when s.negotiation_private_snapshot->>'mode' = 'MANAGER_FINAL_PRICE' then 'MANAGER_ADJUSTED'"
    );
    expect(migration).toContain("'pricing_mode',pricing_mode");
    expect(migration).toContain("else 'INVALID'");
    expect(migration).not.toContain("'minimum_allowed_total'");
    expect(migration).not.toContain("'negotiation_private_snapshot'");
  });

  it("reasserts RPC execution only for service_role", () => {
    expect(migration).toMatch(
      /revoke all on function public\.quote_list_secure\([\s\S]*?\) from public,anon,authenticated,service_role;/i
    );
    expect(migration).toMatch(
      /grant execute on function public\.quote_list_secure\([\s\S]*?\) to service_role;/i
    );
  });

  it("does not mutate Quote data", () => {
    expect(migration).not.toMatch(/\binsert\s+into\b/i);
    expect(migration).not.toMatch(/\bupdate\s+public\.quotes\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
    expect(migration).not.toMatch(/\balter\s+table\b/i);
  });
});
