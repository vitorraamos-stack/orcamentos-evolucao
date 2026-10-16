import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "docs/tasks/phase-19vc-read-only-preflight.sql", "utf8"
);
const candidate = readFileSync(
  "docs/tasks/phase-19vc-financial-write-guards-CANDIDATE.sql", "utf8"
);

describe("19V-C: read-only safety-gate queries", () => {
  it("never mutates production or impersonates sessions", () => {
    expect(sql).toMatch(/SELECT \* FROM checks;/);
    expect(sql).toContain("WITH checks AS");
    for (const statement of [
      "INSERT INTO", "UPDATE public.", "DELETE FROM", "CREATE TRIGGER",
      "DROP ", "ALTER TABLE", "TRUNCATE TABLE", "GRANT ", "REVOKE ",
      "SET ROLE", "set_config("
    ]) expect(sql).not.toContain(statement);
  });
  it("pins all critical migration, RLS, role and FK checks", () => {
    for (const phrase of [
      "has_19va_migration", "unchanged_19va_body", "unchanged_19t_body",
      "all_three_tables_rls", "cascading_fk_baseline", "auth_not_postgres",
      "auth_not_service", "auth_can_call_current_rpc", "anon_cannot_call_rpc",
      "dangerous_legacy_truncate_still_granted"
    ]) expect(sql).toContain(phrase);
  });
  it("candidate gates against drift and validates private helper grants", () => {
    expect(candidate).toContain("19VC_POLICY_DRIFT");
    expect(candidate).toContain("19VC_ROLE_INHERITANCE_DRIFT");
    expect(candidate).toContain("19VC_PRIVATE_HELPER_GRANTS_INVALID");
    expect(candidate).toContain("evolusystem_finance_private");
    expect(candidate).toContain("'anon','evolusystem_finance_private','USAGE'");
    expect(candidate).toContain("'service_role','evolusystem_finance_private','USAGE'");
  });
});
