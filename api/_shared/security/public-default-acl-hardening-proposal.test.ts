import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const candidate = readFileSync(
  "docs/tasks/public-default-acl-hardening-CANDIDATE.sql", "utf8"
);
const readOnly = readFileSync(
  "docs/tasks/public-default-acl-hardening-READ-ONLY.sql", "utf8"
);
const review = readFileSync(
  "docs/tasks/public-default-acl-hardening-review.md", "utf8"
);

describe("future public-table privileges candidate — not applied", () => {
  it("is strictly scoped to postgres-created future tables", () => {
    expect(candidate).toContain("REVIEW CANDIDATE, NOT APPLIED");
    expect(candidate).toContain(
      "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public"
    );
    expect(candidate).toContain(
      "REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN"
    );
    expect(candidate).toContain("ON TABLES FROM anon, authenticated;");
    expect(candidate).not.toContain("FOR ROLE supabase_admin");
    expect(candidate).not.toContain("ON TABLE public.");
    expect(candidate).not.toContain("ALTER TABLE public.");
    expect(candidate).not.toContain("UPDATE public.");
    expect(candidate).not.toContain("CREATE TABLE");
    expect(candidate).not.toContain("SET ROLE");
  });

  it("fails closed for privilege or default-ACL drift", () => {
    expect(candidate).toContain("DEFAULT_ACL_GLOBAL_TABLE_GRANTS_REQUIRE_REVIEW");
    expect(candidate).toContain("DEFAULT_ACL_DATA_API_SETTING_DRIFT");
    expect(candidate).toContain("DEFAULT_ACL_CLIENT_PRIVILEGES_BASELINE_DRIFT");
    expect(candidate).toContain("DEFAULT_ACL_SERVICE_ROLE_REGRESSION");
    expect(candidate).toContain("DEFAULT_ACL_EXISTING_19VC1_GRANTS_REGRESSION");
    expect(candidate).toContain("20261016124926");
    expect(candidate).toContain("pg_catalog.aclexplode");
  });

  it("keeps the evidence SQL read-only, without objects or role changes", () => {
    expect(readOnly).toContain("SELECT");
    expect(readOnly).toContain("existing_public_tables_with_rls");
    for (const forbidden of [
      "ALTER DEFAULT PRIVILEGES", "CREATE TABLE ", "INSERT INTO ",
      "DELETE FROM ", "REVOKE TRUNCATE", "SET ROLE "
    ]) {
      // The header may name actions in comments; verify the executable SQL below.
      const executable = readOnly.replace(/^--.*$/gm, "");
      expect(executable).not.toContain(forbidden);
    }
  });

  it("explicitly documents supabase_admin and production authorization blockers", () => {
    expect(review).toContain("supabase_admin");
    expect(review).toContain("não é membro");
    expect(review).toContain("sem nova aprovação e testes");
  });
});
