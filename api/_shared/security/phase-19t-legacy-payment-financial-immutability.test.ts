import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261014195000_phase_19t_legacy_payment_financial_immutability.sql", "utf8").replaceAll("\r\n", "\n");

describe("19T legacy proof financial immutability", () => {
  it("refuses to modify a drifting production guard or policy", () => {
    for (const error of [
      "19T_ABORTED_GUARD_FUNCTION_DRIFT",
      "19T_ABORTED_GUARD_TRIGGER_DRIFT",
      "19T_ABORTED_EXISTING_PROOFS_NEED_REVIEW",
      "19T_ABORTED_PROOF_RLS_DRIFT",
      "19T_ABORTED_EVENT_RETENTION_DRIFT",
      "19T_ABORTED_ALREADY_APPLIED",
      "19T_ABORTED_GUARD_POSTCONDITION",
      "19T_ABORTED_TRIGGER_POSTCONDITION",
      "19T_ABORTED_RETAINED_19S_POSTCONDITION"
    ]) expect(sql).toContain(error);
    expect(sql).toContain("md5(p.prosrc)='7eb6ece017db3dbcdb44a1aaeb352a3a'");
    expect(sql).toContain("p.proacl::text='{postgres=X/postgres,service_role=X/postgres}'");
  });

  it("permits only a pending, empty R2 proof on authenticated INSERT", () => {
    expect(sql).toContain("NEW.status IS DISTINCT FROM 'PENDING'");
    expect(sql).toContain("NEW.storage_provider IS DISTINCT FROM 'r2'");
    for (const col of ["attachment_path","attachment_url","storage_bucket","r2_etag","content_type","size_bytes","synced_to_smb_at","smb_path"]) expect(sql).toContain(`OR NEW.${col} IS NOT NULL`);
    expect(sql).toContain("NEW.created_by := auth.uid()");
    expect(sql).toContain("NEW.created_at := now()");
  });

  it("blocks changing financial fields or finalized records while preserving initial attachment", () => {
    expect(sql).toContain("OLD.status IS DISTINCT FROM 'PENDING'");
    expect(sql).toContain("AND e.type = 'PAYMENT_SUBMITTED'");
    expect(sql).toContain("e.payload->>'payment_id' = OLD.id::text");
    for (const col of ["attachment_path","attachment_url","storage_bucket","r2_etag","content_type","size_bytes","synced_to_smb_at","smb_path"]) expect(sql).toContain(`OR OLD.${col} IS NOT NULL`);
    expect(sql).toContain("NEW.status IS DISTINCT FROM OLD.status");
    for (const col of ["method","amount","received_date","installments","cadastro_completo","storage_provider"]) expect(sql).toContain(`OR NEW.${col} IS DISTINCT FROM OLD.${col}`);
    expect(sql).toContain("19S_PROOF_PROVENANCE_IMMUTABLE");
    expect(sql).toContain("19S_UPLOADED_PROOF_METADATA_IMMUTABLE");
    expect(sql).toContain("19T_FINANCIAL_FIELDS_IMMUTABLE");
    expect(sql).toContain("19T_PROOF_FINALIZED_IMMUTABLE");
  });

  it("replaces one invoker function without touching privileges, policies, triggers or data", () => {
    expect((sql.match(/^CREATE OR REPLACE FUNCTION /gm) ?? []).length).toBe(1);
    expect(sql).toContain("RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER");
    expect(sql).toContain("SET search_path TO ''");
    expect(sql).not.toMatch(/^\s*(?:CREATE|ALTER|DROP)\s+(?:TRIGGER|POLICY)\b/im);
    expect(sql).not.toMatch(/^\s*(?:GRANT|REVOKE)\b/im);
    expect(sql).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO\s+|FROM\s+)?(?:public\.|auth\.)/im);
  });
});
