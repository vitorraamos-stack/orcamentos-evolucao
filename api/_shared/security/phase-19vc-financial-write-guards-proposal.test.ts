import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "docs/tasks/phase-19vc-financial-write-guards-CANDIDATE.sql",
  "utf8"
);
const doc = readFileSync(
  "docs/tasks/phase-19vc-financial-write-guards-review.md",
  "utf8"
);
const clientApi = readFileSync("src/modules/hub-os/api.ts","utf8");

describe("19V-C candidate — static architecture checks, no DB execution", () => {
  it("cannot be mistaken for applied or deployable migration", () => {
    expect(sql).toContain("DESIGN CANDIDATE, NOT APPLIED");
    expect(sql).toContain("DO NOT EXECUTE WITHOUT SEPARATE AUTHORIZATION");
    expect(doc).toContain("não aplicada");
    expect(doc).toContain("fora");
  });
  it("retains public invoker RPC and scopes the definer to private schema", () => {
    expect(sql).toContain("CREATE SCHEMA evolusystem_finance_private");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SECURITY INVOKER");
    expect(sql).toContain("SET search_path TO ''");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.finalize_legacy_payment_submission(p_proof_id uuid)");
    expect(sql).toContain("RETURN evolusystem_finance_private.finalize_legacy_payment_submission(p_proof_id)");
    expect(sql).toContain("p.created_by=v_actor");
    expect(sql).toContain("public.has_module_access(v_actor,'hub_os')");
    expect(sql).toContain("'already_submitted',true");
    expect(sql).toContain("'already_submitted',false");
    expect(clientApi).toContain('.rpc("finalize_legacy_payment_submission", {');
  });
  it("removes table UPDATE and returns specific non-financial columns only", () => {
    expect(sql).toContain("REVOKE UPDATE ON public.os FROM authenticated,anon");
    expect(sql).toContain("GRANT UPDATE (customer_name");
    const grant=sql.slice(sql.indexOf("GRANT UPDATE (")+14,sql.indexOf(") ON public.os TO authenticated"));
    expect(grant).not.toContain("payment_status");
    expect(grant).not.toContain("quote_total");
    expect(grant).not.toContain("created_by");
    expect(grant).not.toContain("os_number");
    expect(grant).not.toContain("quote_id");
    expect(grant).toContain("status_arte");
    expect(grant).toContain("status_producao");
    expect(grant).toContain("status_id");
    expect(sql).toContain("19VC_POSTCHECK_FAILED");
    expect(sql).toContain("REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.os");
    expect(sql).toContain("REVOKE TRIGGER, REFERENCES ON public.os_event,public.os_payment_proof");
    expect(sql).toContain("pg_catalog.has_table_privilege('authenticated','public.os','TRUNCATE')");
    expect(sql).toContain("19VC_TRIGGER_POSTCHECK_FAILED");
    expect(sql).toContain("pg_catalog.has_table_privilege('anon','public.os','UPDATE')");
    expect(sql).toContain("pg_catalog.has_column_privilege('authenticated','public.os','quote_id','UPDATE')");
  });
  it("preserves nonfinancial events and blocks submitted event/OS tampering", () => {
    expect(sql).toContain("BEFORE INSERT OR UPDATE OR DELETE ON public.os_event");
    expect(sql).toContain("19VC_DIRECT_FINANCIAL_EVENT_INSERT_BLOCKED");
    expect(sql).toContain("19VC_DIRECT_FINANCIAL_EVENT_UPDATE_BLOCKED");
    expect(sql).toContain("19VC_DIRECT_FINANCIAL_EVENT_DELETE_BLOCKED");
    expect(sql).toContain("19VC_OS_WITH_FINANCIAL_ARTIFACT_DELETE_BLOCKED");
    expect(sql).toContain("SELECT 1 FROM public.os_payment_proof p");
    expect(sql).toContain("19VC_PARENT_CASCADE_DRIFT");
    expect(sql).toContain("os_payment_proof_os_id_fkey");
    expect(sql).toContain("os_event_os_id_fkey");
    expect(sql).toContain("19VC_DIRECT_FINANCIAL_OS_INSERT_BLOCKED");
    expect(sql).toContain("NEW.quote_total IS NOT NULL");
    expect(sql).toContain("NEW.quote_id IS NOT NULL");
    expect(sql).toContain("current_user NOT IN ('postgres','service_role')");
  });
  it("does not alter proof guard, R2 integration or production SQL", () => {
    expect(sql).toContain("8af26088723a9b4fb8dfb8863108affc");
    expect(sql).toContain("cc781eed0a4c590edb7facc4c9a731fd");
    expect(sql).not.toContain("DROP TABLE");
    expect(sql).not.toContain("ALTER TABLE public.os_payment_proof");
    expect(doc).toContain("PostgreSQL local isolado");
    expect(doc).toContain("bloqueia `quote_total` e `quote_id`");
    expect(doc).toContain("TRUNCATE");
    expect(doc).toContain("não será exposto");
    expect(doc).toContain("não pode excluir OS com comprovantes");
  });
});
