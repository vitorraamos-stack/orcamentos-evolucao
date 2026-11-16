import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const file = (path: string) => readFileSync(path, "utf8");
const sql = file("docs/tasks/canonical-finance-upsert-settled-guard-CANDIDATE.sql");
const doc = file("docs/tasks/canonical-finance-upsert-settled-guard-review.md");
const gates = file("docs/tasks/canonical-finance-upsert-settled-guard-READ-ONLY.sql");
const original = file("supabase/migrations/20261013181345_phase_19f_finance_receipt_rpc_hardening.sql");
const client = file("src/features/hubos/assets.ts");

describe("Canonical finance: settled installment immutability candidate", () => {
  it("preserves identity and receipt ownership checks", () => {
    expect(sql).toContain("REVIEW ONLY. NOT APPLIED");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO ''");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("public.has_module_access(v_actor_id,'hub_os')");
    for (const item of ["a.id=p_asset_id","a.os_id=p_os_id","a.uploaded_by=v_actor_id",
      "a.asset_type='PAYMENT_PROOF'","a.storage_provider='r2'",
      "a.deleted_from_storage_at IS NULL","a.error IS NULL"]) {
      expect(sql).toContain(item);
    }
    expect(original).toContain("public.finance_upsert_from_asset");
    expect(client).toContain('"finance_upsert_from_asset"');
  });

  it("locks OS then existing installments before deciding mutations", () => {
    const fn = sql.slice(sql.indexOf("AS $finance$"));
    const parentLock = fn.indexOf("FOR NO KEY UPDATE;");
    const childLock = fn.indexOf("FOR UPDATE;");
    const settledGuard = fn.indexOf("i.status IN ('CONCILIADO','LANCADO')");
    const firstInsert = fn.indexOf("INSERT INTO public.os_finance_installments");
    expect(parentLock).toBeGreaterThan(0);
    expect(childLock).toBeGreaterThan(parentLock);
    expect(settledGuard).toBeGreaterThan(childLock);
    expect(firstInsert).toBeGreaterThan(settledGuard);
    expect(fn).toContain("p_installment_label IN ('1/1','1/2')");
    expect(fn).toContain("p_installment_label='2/2' AND EXISTS");
    expect(fn).toContain("i.installment_no=2");
    expect(fn).toContain("procedimento administrativo");
  });

  it("preserves 2/2 handling if only installment 1 is settled", () => {
    const fn = sql.slice(sql.indexOf("AS $finance$"));
    const guard2 = fn.slice(fn.indexOf("IF p_installment_label='2/2' AND EXISTS"));
    expect(guard2).toContain("i.installment_no=2");
    expect(guard2.slice(0,340)).not.toContain("i.installment_no=1");
    expect(fn).toContain("SET asset_id=p_asset_id, status='PENDING_REVIEW'");
    expect(doc).toContain("**permitir**");
  });

  it("keeps the read-only SQL non-mutating and documents security blockers", () => {
    const executable = gates.replace(/^--.*$/gm, "");
    expect(executable.trimStart().startsWith("SELECT")).toBe(true);
    expect(executable).not.toMatch(/(?:^|\n)\s*(?:ALTER|CREATE|DROP|GRANT|REVOKE|UPDATE|INSERT|DELETE|CALL|DO|SET|BEGIN)\b/i);
    expect(doc).toContain("PR #523 permanece");
    expect(doc).toContain("Exclusão direta de OS");
    expect(doc).toContain("nenhuma das propriedades acima foi executada em");
    expect(doc).toContain("idempotência e concorrência");
  });
});
