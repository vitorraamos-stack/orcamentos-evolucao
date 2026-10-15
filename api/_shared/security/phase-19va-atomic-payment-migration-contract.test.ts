import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "docs/tasks/phase-19va-migration-CANDIDATE.sql",
  "utf8"
).replaceAll("\r\n", "\n");

describe("19V-A candidate: static checks ONLY; NOT a PostgreSQL integration test", () => {
  it("is explicitly non-applied, non-CLI-generated, and additive", () => {
    expect(sql).toContain("CANDIDATE, NOT APPLIED");
    expect(sql).toContain("before this SQL is ever executed");
    expect(sql).toContain("legacy UI remains unchanged");
    expect(sql).toContain("Existing direct financial UPDATE/INSERT/DELETE remain possible");
  });

  it("aborts safely if existing objects, RLS, permissions or 19T differ", () => {
    for (const message of [
      "19VA_ABORT_EXISTING_OBJECT", "19VA_ABORT_TABLE_RLS_DRIFT",
      "19VA_ABORT_19T_DRIFT", "19VA_ABORT_RLS_DRIFT",
      "19VA_ABORT_GRANTS_DRIFT", "19VA_ABORT_INVALID_LEGACY_EVENT",
      "19VA_ABORT_DUPLICATE_SUBMISSIONS",
    ]) expect(sql).toContain(message);
    expect(sql).toContain("8af26088723a9b4fb8dfb8863108affc");
    expect(sql.indexOf("DO $preflight$"))
      .toBeLessThan(sql.indexOf("CREATE UNIQUE INDEX os_event_payment_submission_once"));
  });

  it("defines a scoped unique payment event and invoker RPC only", () => {
    expect(sql).toContain("CREATE UNIQUE INDEX os_event_payment_submission_once");
    expect(sql).toContain("WHERE type='PAYMENT_SUBMITTED'");
    expect(sql).toContain("CREATE FUNCTION public.finalize_legacy_payment_submission(p_proof_id uuid)");
    expect(sql).toContain("SECURITY INVOKER");
    expect(sql).not.toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path TO ''");
    expect(sql).toContain("current_user <> 'authenticated'");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("public.has_module_access(v_actor,'hub_os')");
    expect(sql).toContain("p.created_by=v_actor");
    expect(sql).toContain("FROM PUBLIC,anon,service_role");
    expect(sql).toContain("TO authenticated");
    expect(sql).not.toContain("p_os_id uuid");
    expect(sql).not.toContain("p_status text");
    expect(sql).not.toContain("p_user_id uuid");
  });

  it("orders locks and UPDATE before INSERT, returns retry result", () => {
    const osLock=sql.indexOf("FROM public.os o\n  WHERE o.id=v_os_id\n  FOR UPDATE");
    const proofLock=sql.indexOf("FROM public.os_payment_proof p\n  WHERE p.id=p_proof_id AND p.os_id=v_order.id AND p.created_by=v_actor\n  FOR UPDATE");
    const update=sql.indexOf("UPDATE public.os o");
    const insert=sql.indexOf("INSERT INTO public.os_event");
    expect(osLock).toBeGreaterThan(0);
    expect(proofLock).toBeGreaterThan(osLock);
    expect(update).toBeGreaterThan(proofLock);
    expect(insert).toBeGreaterThan(update);
    expect(sql).toContain("'already_submitted',true");
    expect(sql).toContain("'already_submitted',false");
    expect(sql).toContain("19VA_EVENT_PROVENANCE_INVALID");
  });

  it("preserves 19T immutability; calculates on trusted DB values and date", () => {
    expect(sql).toContain("v_proof.method='AGENDADO'");
    expect(sql).toContain("v_proof.amount>=v_order.quote_total");
    expect(sql).toContain("America/Sao_Paulo");
    expect(sql).toContain("19VA_ATTACHMENT_INCOMPLETE");
    expect(sql).toContain("19VA_FINANCIAL_VALUES_INVALID");
    expect(sql).toContain("19VA_POSTCHECK_FAILED");
    expect(sql).not.toMatch(/ALTER TABLE public\.(?:os|os_event|os_payment_proof)/);
    expect(sql).not.toMatch(/DROP (?:TABLE|TRIGGER|FUNCTION)/);
  });
});
