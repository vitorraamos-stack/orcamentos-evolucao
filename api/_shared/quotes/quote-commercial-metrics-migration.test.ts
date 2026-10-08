import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "docs/tasks/18m-quote-commercial-metrics-migration.sql",
  "utf8"
).replaceAll("\r\n", "\n");

describe("Quote commercial metrics migration draft 18M", () => {
  it("uses STABLE SECURITY INVOKER with a fixed search_path", () => {
    expect(sql).toMatch(/language\s+sql/i);
    expect(sql).toMatch(/stable\s+security\s+invoker/i);
    expect(sql).toMatch(
      /set\s+search_path\s*=\s*pg_catalog,\s*public/i
    );
    expect(sql).not.toMatch(/security\s+definer/i);
  });

  it("scopes visible Quotes to owner or manager", () => {
    expect(sql).toContain("coalesce(p_is_manager,false)");
    expect(sql).toContain("q.created_by = p_actor_id");
  });

  it("computes conversion from accepted plus rejected decisions only", () => {
    expect(sql).toContain("status in ('ACCEPTED','REJECTED')");
    expect(sql).toContain("c.accepted_quotes::numeric * 10000 / c.decided_quotes");
    expect(sql).not.toContain("status in ('ACCEPTED','REJECTED','CANCELLED')");
  });

  it("returns only aggregate loss reason codes, never notes or customers", () => {
    expect(sql).toContain("'loss_reasons'");
    expect(sql).toContain("ev.payload->>'reason_code'");
    expect(sql).not.toContain("reason_note");
    expect(sql).not.toContain("customer_name");
    expect(sql).not.toContain("customer_phone");
  });

  it("locks EXECUTE to service_role and performs no mutations", () => {
    expect(sql).toMatch(
      /revoke all on function public\.quote_commercial_metrics_secure\([\s\S]*?\) from public,anon,authenticated,service_role;/i
    );
    expect(sql).toMatch(
      /grant execute on function public\.quote_commercial_metrics_secure\([\s\S]*?\) to service_role;/i
    );
    expect(sql).not.toMatch(/\binsert\s+into\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
  });
});
