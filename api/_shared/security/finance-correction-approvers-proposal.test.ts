import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const sql = read("docs/tasks/finance-correction-approvers-CANDIDATE.sql");
const doc = read("docs/tasks/finance-correction-approvers-review.md");
const audit = read("docs/tasks/finance-correction-approvers-READ-ONLY.sql");

describe("finance correction approval: explicit privilege only", () => {
  it("excludes general managers and normal finance-module users", () => {
    expect(sql).toContain("p.role='admin'");
    expect(sql).toContain("p.is_super_admin IS TRUE");
    expect(sql).toContain("public.has_module_access(auth.uid(),'hub_os_financeiro')");
    expect(sql).toContain("a.user_id=auth.uid() AND a.revoked_at IS NULL");
    expect(sql.replace(/^--.*$/gm, "")).not.toContain("public.is_admin(");
    expect(sql).not.toContain("p.role='gerente'");
  });
  it("keeps the allowlist private and exposes only a caller-owned boolean", () => {
    expect(sql).toContain("REVIEW-ONLY CANDIDATE");
    expect(sql).toContain("CREATE SCHEMA evolusystem_finance_approval_private");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON SCHEMA");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("CREATE FUNCTION public.can_approve_finance_correction()");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO ''");
    expect(sql).not.toContain("p_user_id uuid");
  });
  it("does not perform a correction or silently edit finance records", () => {
    const code = sql.replace(/^--.*$/gm, "");
    expect(code).not.toMatch(/UPDATE\s+public\.os_finance_installments/i);
    expect(code).not.toMatch(/DELETE\s+FROM\s+public\.os_finance_installments/i);
    expect(doc).toContain("Quem solicitou a retificação poderá aprovar");
    expect(doc).toContain("Nunca remover o arquivo original");
  });
  it("ships only read-only production evidence", () => {
    const query = audit.replace(/^--.*$/gm, "");
    expect(query.trimStart().startsWith("SELECT")).toBe(true);
    expect(query).not.toMatch(/(?:^|\n)\s*(?:ALTER|CREATE|DROP|UPDATE|INSERT|DELETE|GRANT|REVOKE|CALL|DO|SET)\b/im);
    expect(doc).toContain("PR #523");
    expect(doc).toContain("PR #527");
    expect(doc).toContain("PR #529");
  });
});
