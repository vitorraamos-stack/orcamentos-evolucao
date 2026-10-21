import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(f, "utf8");
const candidate = read("docs/tasks/canonical-finance-installments-acl-CANDIDATE.sql");
const evidence = read("docs/tasks/canonical-finance-installments-READ-ONLY.sql");
const review = read("docs/tasks/canonical-finance-installments-review.md");
const api = read("src/features/hubos/finance.ts");
const assets = read("src/features/hubos/assets.ts");

describe("canonical finance privileges — review only", () => {
  it("limits proposed SQL to the current installments table", () => {
    expect(candidate).toContain("REVIEW CANDIDATE; NOT APPLIED");
    expect(candidate).toContain("REVOKE ALL ON TABLE public.os_finance_installments FROM anon");
    expect(candidate).toContain("REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES, MAINTAIN");
    expect(candidate).toContain("GRANT UPDATE (status, notes, reviewed_at, reviewed_by)");
    expect(candidate).toContain("CANONICAL_FINANCE_ACL_POSTCHECK_FAILED");
    expect(candidate).toContain("CANONICAL_FINANCE_ORDER_DIRECT_DELETE_BYPASS_UNRESOLVED");
    expect(candidate).toContain("CANONICAL_FINANCE_UPSERT_RECONCILIATION_RESET_UNRESOLVED");
    expect(candidate).not.toMatch(/\b(?:CREATE TABLE|ALTER TABLE|DROP TABLE|UPDATE public\.|INSERT INTO public\.|DELETE FROM public\.)/i);
    expect(candidate).not.toMatch(/\b(?:REVOKE|GRANT)[^;]*\b(?:service_role|postgres)\s*;/i);
    expect(candidate).not.toContain("ALTER POLICY");
  });

  it("preserves actual UI writes and privileged asset RPC", () => {
    for (const column of ["status", "notes", "reviewed_at", "reviewed_by"]) {
      expect(api).toContain(column);
    }
    expect(api).toContain(".from('os_finance_installments')");
    expect(assets).toContain('"finance_upsert_from_asset"');
    expect(candidate).toContain("9bc1567dad2ab1640a82bf9893fc8ef3");
    expect(candidate).toContain("df7e652e9ec347cdd3583209e9b0d44f");
  });

  it("leaves auditing non-mutating and accurately marks runtime gaps", () => {
    const stripped = evidence.replace(/^--.*$/gm, "");
    expect(stripped.trimStart().startsWith("SELECT")).toBe(true);
    expect(stripped).not.toMatch(/(?:^|\n)\s*(?:ALTER|CREATE|DROP|GRANT|REVOKE|UPDATE|INSERT|DELETE|DO|SET ROLE)\b/i);
    expect(review).toContain("não aplicado");
    expect(review).toContain("integrações externas");
    expect(review).toContain("reviewed_by");
    expect(review).toContain("nova autorização explícita");
    expect(review).toContain("Risco A");
    expect(review).toContain("Risco B");
    expect(review).toContain("não tem gatilho BEFORE DELETE");
    const guards = read("docs/tasks/canonical-finance-integrity-blockers-READ-ONLY.sql");
    const sqlOnly = guards.replace(/^--.*$/gm, "");
    expect(sqlOnly.trimStart().startsWith("SELECT")).toBe(true);
    expect(sqlOnly).not.toMatch(/(?:^|\n)\s*(?:ALTER|CREATE|DROP|GRANT|REVOKE|UPDATE|INSERT|DELETE|DO|SET ROLE)\b/i);
  });
});
