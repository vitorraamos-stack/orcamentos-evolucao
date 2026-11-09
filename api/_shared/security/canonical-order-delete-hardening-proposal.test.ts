import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const sql = read("docs/tasks/canonical-order-delete-hardening-CANDIDATE.sql");
const checks = read("docs/tasks/canonical-order-delete-hardening-READ-ONLY.sql");
const review = read("docs/tasks/canonical-order-delete-hardening-review.md");
const repo = read("src/modules/orders/repositories/orderGovernanceRepository.ts");

describe("canonical OS direct-delete hardening proposal (not deployed)", () => {
  it("fails closed on unexpected direct DELETE or governance RPC drift", () => {
    expect(sql).toContain("REVIEW CANDIDATE. NOT APPLIED");
    expect(sql).toContain("OS_DELETE_GUARD_PARENT_OWNER_RLS_DRIFT");
    expect(sql).toContain("OS_DELETE_GUARD_CURRENT_ACL_DRIFT");
    expect(sql).toContain("OS_DELETE_GUARD_DELETE_POLICY_DRIFT");
    expect(sql).toContain("90b1813c2c55dae92807c2329e2e5ee3");
    expect(sql).toContain("7f48099f8f2aa6ee35241aa81bed70b1");
    expect(sql).toContain("3ceb05928ebf82a45853575d6b87d00e");
  });

  it("removes only client direct-delete grants/policy", () => {
    const executable = sql.replace(/^--.*$/gm, "");
    expect(executable).toContain(
      "REVOKE DELETE ON TABLE public.os_orders FROM anon, authenticated;"
    );
    expect(executable).toContain(
      "DROP POLICY os_orders_delete_admin ON public.os_orders;"
    );
    expect(executable).not.toMatch(/\b(?:DELETE FROM|TRUNCATE|ALTER TABLE|CREATE TABLE|DROP TABLE|UPDATE public\.|INSERT INTO public\.)\b/i);
    expect(executable).not.toMatch(/\b(?:REVOKE|GRANT)[^;]*\bservice_role\s*;/i);
    expect(executable).toContain("OS_DELETE_GUARD_CLIENT_GRANTS_POSTCHECK");
    expect(executable).toContain("OS_DELETE_GUARD_GOVERNANCE_RPC_POSTCHECK");
  });

  it("keeps the existing UI deletion on the audited secure RPC", () => {
    expect(repo).toContain("hub_os_delete_order_preview_secure");
    expect(repo).toContain("hub_os_delete_order_secure_v2");
    expect(review).toContain("ON DELETE CASCADE");
    expect(review).toContain("service_role");
  });

  it("marks the read-only query and independent admin correction scope", () => {
    const executable = checks.replace(/^--.*$/gm, "");
    expect(executable.trimStart().startsWith("SELECT")).toBe(true);
    expect(executable).not.toMatch(
      /(?:^|\n)\s*(?:ALTER|CREATE|DROP|GRANT|REVOKE|UPDATE|INSERT|DELETE|CALL|DO|SET)\b/i
    );
    expect(review).toContain("Correção administrativa");
    expect(review).toContain("PR #523");
    expect(review).toContain("PR #527");
    expect(review).toContain("nova autorização explícita");
  });
});
