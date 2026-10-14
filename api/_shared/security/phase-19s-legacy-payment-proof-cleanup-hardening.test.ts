import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261014185000_phase_19s_legacy_payment_proof_cleanup_hardening.sql", "utf8").replaceAll("\r\n", "\n");
const protectedFields = ["attachment_path","attachment_url","storage_bucket","r2_etag","content_type","size_bytes","synced_to_smb_at","smb_path"];

describe("19S legacy payment proof rollback-only deletion", () => {
  it("fails closed on existing proofs and permission/policy drift", () => {
    expect(sql).toContain("DO $preflight$");
    expect(sql).toContain("DO $postcheck$");
    for (const error of [
      "19S_ABORTED_UNEXPECTED_PROOF_SCHEMA_OR_TRIGGER",
      "19S_ABORTED_TABLE_ACL_DRIFT",
      "19S_ABORTED_EXISTING_PROOFS_NEED_DATA_REVIEW",
      "19S_ABORTED_PROOF_POLICY_DRIFT",
      "19S_ABORTED_ACCESS_HELPER_DRIFT",
      "19S_ABORTED_LEGACY_EVENT_RETENTION_DRIFT",
      "19S_ABORTED_POSTCONDITION_DELETE_PENDING_ONLY",
      "19S_ABORTED_POSTCONDITION_PROVENANCE_TRIGGER",
    ]) expect(sql).toContain(error);
  });

  it("keeps failed-upload rollback, but blocks attached, submitted, or other-user proofs", () => {
    expect(sql).toContain("AND created_by=auth.uid()");
    expect(sql).toContain("AND status='PENDING'");
    expect(sql).toContain("created_at >= now() - interval '24 hours'");
    expect(sql).toContain("AND e.type='PAYMENT_SUBMITTED'");
    expect(sql).toContain("AND e.payload->>'payment_id'=os_payment_proof.id::text");
    for (const field of protectedFields) expect(sql).toContain(`AND ${field} IS NULL`);
    expect(sql).toContain("ALTER POLICY os_payment_delete ON public.os_payment_proof");
    expect(sql).toContain("ALTER POLICY os_payment_update ON public.os_payment_proof");
    expect(sql).toContain("WITH CHECK (public.has_module_access(auth.uid(), 'hub_os') AND created_by=auth.uid())");
  });

  it("stamps creator and blocks spoofed ownership and metadata rollback", () => {
    expect(sql).toContain("SECURITY INVOKER");
    expect(sql).toContain("SET search_path TO ''");
    expect(sql).toContain("NEW.created_by := auth.uid()");
    expect(sql).toContain("NEW.created_at := now()");
    expect(sql).toContain("NEW.os_id IS DISTINCT FROM OLD.os_id");
    expect(sql).toContain("NEW.created_by IS DISTINCT FROM OLD.created_by");
    expect(sql).toContain("NEW.created_at IS DISTINCT FROM OLD.created_at");
    for (const field of protectedFields) {
      expect(sql).toContain(`OLD.${field} IS NOT NULL AND NEW.${field} IS DISTINCT FROM OLD.${field}`);
    }
    expect(sql).toContain("CREATE TRIGGER trg_guard_legacy_payment_proof_mutations");
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.guard_legacy_payment_proof_mutations()");
  });

  it("revokes RLS-bypassing table privileges and never touches data or unrelated policies", () => {
    expect(sql).toContain("REVOKE TRUNCATE, TRIGGER ON TABLE public.os_payment_proof");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated;");
    const alteredPolicies=sql.match(/^ALTER POLICY .*$/gm)??[];
    expect(alteredPolicies).toEqual([
      "ALTER POLICY os_payment_update ON public.os_payment_proof",
      "ALTER POLICY os_payment_delete ON public.os_payment_proof",
    ]);
    expect(sql).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO\s+|FROM\s+)?(?:public\.|auth\.)/im);
    expect(sql).not.toMatch(/^ALTER POLICY .+ON public\.(?:os|os_event|os_orders|os_status)\b/m);
    expect(sql).not.toMatch(/^\s*(?:DROP|CREATE)\s+POLICY\b/im);
  });
});
