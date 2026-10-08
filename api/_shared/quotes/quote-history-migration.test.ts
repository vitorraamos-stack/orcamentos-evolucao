import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "docs/tasks/18k-quote-history-migration.sql",
  "utf8"
).replaceAll("\r\n", "\n");

describe("Quote history migration draft 18K", () => {
  it("uses STABLE SECURITY INVOKER and a fixed search_path", () => {
    expect(sql).toMatch(/stable\s+security\s+invoker/i);
    expect(sql).toMatch(
      /set\s+search_path\s*=\s*pg_catalog,\s*public/i
    );
    expect(sql).not.toMatch(/security\s+definer/i);
  });

  it("enforces owner-or-manager authorization inside the RPC", () => {
    expect(sql).toContain("QUOTE_NOT_FOUND");
    expect(sql).toContain("QUOTE_FORBIDDEN");
    expect(sql).toContain("v_owner is distinct from p_actor_id");
  });

  it("returns sanitized history instead of raw audit payloads", () => {
    expect(sql).toContain("'pricing_mode'");
    expect(sql).toContain("'MANAGER_ADJUSTED'");
    expect(sql).toContain("'total_selling_price'");
    expect(sql).toContain("'from_status'");
    expect(sql).toContain("'to_status'");
    expect(sql).not.toContain("'payload',");
    expect(sql).not.toContain("'minimum_allowed_total'");
    expect(sql).not.toContain("'negotiation_private_snapshot',");
  });

  it("caps the public timeline to the latest 200 events", () => {
    expect(sql).toMatch(/order by e\.occurred_at desc, e\.id desc\s+limit 200/i);
  });

  it("locks EXECUTE to service_role and performs no data mutation", () => {
    expect(sql).toMatch(
      /revoke all on function public\.quote_history_secure\([\s\S]*?\) from public,anon,authenticated,service_role;/i
    );
    expect(sql).toMatch(
      /grant execute on function public\.quote_history_secure\([\s\S]*?\) to service_role;/i
    );
    expect(sql).not.toMatch(/\binsert\s+into\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
  });
});
