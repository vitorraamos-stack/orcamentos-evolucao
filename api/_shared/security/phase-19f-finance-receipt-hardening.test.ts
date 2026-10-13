import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20261013181345_phase_19f_finance_receipt_rpc_hardening.sql",
  "utf8"
).replaceAll("\r\n", "\n");

describe("19F protected finance payment receipt RPC", () => {
  it("fails closed when the existing finance contracts change", () => {
    for (const guard of [
      "19F_ABORTED_REQUIRED_OBJECT_MISSING",
      "19F_ABORTED_UNRECOGNIZED_FINANCE_FUNCTION",
      "19F_ABORTED_CURRENT_PERMISSIONS_UNEXPECTED",
      "19F_ABORTED_POSTCONDITION_FAILED",
    ]) {
      expect(sql).toContain(guard);
    }
  });

  it("blocks anon but preserves the signed-in browser payment proof flow", () => {
    expect(sql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.finance_upsert_from_asset(uuid,uuid,text,date) FROM PUBLIC, anon;"
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.finance_upsert_from_asset(uuid,uuid,text,date) TO authenticated, service_role;"
    );
    expect(sql).toContain("v_actor_id uuid := auth.uid()");
    expect(sql).toContain("IF v_actor_id IS NULL");
    expect(sql).toContain("public.has_module_access(v_actor_id, 'hub_os')");
    expect(sql.indexOf("IF v_actor_id IS NULL")).toBeLessThan(
      sql.indexOf("if p_installment_label not in")
    );
  });

  it("validates the payment proof's OS, uploader, type and storage before modifying installments", () => {
    for (const proofCheck of [
      "a.id = p_asset_id",
      "a.os_id = p_os_id",
      "a.asset_type = 'PAYMENT_PROOF'",
      "a.uploaded_by = v_actor_id",
      "a.storage_provider = 'r2'",
      "a.deleted_from_storage_at IS NULL",
      "a.error IS NULL",
    ]) {
      expect(sql).toContain(proofCheck);
    }
    expect(sql).toContain("public.os_orders o WHERE o.id = p_os_id");
    expect(sql.indexOf("a.error IS NULL")).toBeLessThan(sql.indexOf("if p_installment_label not in"));
  });

  it("retains the original 1/1, 1/2 and 2/2 installment rules", () => {
    for (const branch of ["'1/1'", "'1/2'", "'2/2'"]) {
      expect(sql).toContain("if p_installment_label = " + branch);
    }
    expect(sql).toContain("on conflict (os_id, installment_no)");
    expect(sql).toContain("'PENDING_REVIEW'");
    expect(sql).toContain("'AWAITING_PROOF'");
  });
});
