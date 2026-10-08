import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "docs/tasks/18l-quote-commercial-outcome-migration.sql",
  "utf8"
).replaceAll("\r\n", "\n");

describe("Quote commercial outcome migration draft 18L", () => {
  it("creates transition v2 with owner-or-manager authorization", () => {
    expect(sql).toContain("quote_transition_status_v2_secure");
    expect(sql).toContain("v_before.created_by is distinct from p_actor_id");
    expect(sql).toContain("QUOTE_FORBIDDEN");
    expect(sql).toMatch(/security\s+invoker/i);
    expect(sql).toMatch(/set\s+search_path\s*=\s*pg_catalog,\s*public/i);
  });

  it("requires structured reasons for rejected and cancelled outcomes", () => {
    expect(sql).toContain("p_target_status = 'REJECTED'");
    expect(sql).toContain("p_target_status = 'CANCELLED'");
    expect(sql).toContain("'PRICE'");
    expect(sql).toContain("'DUPLICATE'");
    expect(sql).toContain("p_reason_code = 'OTHER'");
    expect(sql).toContain("char_length(v_reason_note) < 5");
  });

  it("projects sanitized reason fields without returning raw payload", () => {
    expect(sql).toContain("'reason_code',p_reason_code");
    expect(sql).toContain("'reason_note',v_reason_note");
    expect(sql).toContain("'outcome_reason_code'");
    expect(sql).toContain("'outcome_reason_note'");
    expect(sql).not.toContain("'payload', h.payload");
  });

  it("locks transition v2 to service_role", () => {
    expect(sql).toMatch(
      /revoke all on function public\.quote_transition_status_v2_secure\([\s\S]*?\) from public,anon,authenticated,service_role;/i
    );
    expect(sql).toMatch(
      /grant execute on function public\.quote_transition_status_v2_secure\([\s\S]*?\) to service_role;/i
    );
  });

  it("does not alter tables or backfill Quote data", () => {
    expect(sql).not.toMatch(/\balter\s+table\b/i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
  });
});
