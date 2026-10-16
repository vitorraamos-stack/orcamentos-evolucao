import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const candidate=readFileSync(
 "docs/tasks/phase-19vc2-financial-enforcement-CANDIDATE.sql","utf8"
);
const original=readFileSync(
 "supabase/migrations/20261015134750_phase_19va_atomic_payment_finalization.sql","utf8"
);
const c1=readFileSync(
 "supabase/migrations/20261016124926_phase_19vc1_revoke_dangerous_legacy_table_privileges.sql","utf8"
);
const review=readFileSync("docs/tasks/phase-19vc2-readiness-review.md","utf8");
const rollback=readFileSync("docs/tasks/phase-19vc2-rollback-review.md","utf8");

describe("19V-C2: reviewed SQL candidate only — not an applied migration",()=>{
 it("requires the already-applied C1 before any C2 changes",()=>{
  expect(candidate).toContain("20261016124926");
  expect(candidate).toContain("phase_19vc1_revoke_dangerous_legacy_table_privileges");
  expect(candidate).toContain("19VC2_MISSING_19VC1");
  expect(candidate).toContain("19VC2_19VC1_PRIVILEGE_REGRESSION");
  expect(candidate).toContain("19VC2_C1_POSTCHECK_FAILED");
  expect(c1).toContain("REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE");
 });
 it("retains invoker public signature and privileged helper in a private schema",()=>{
  expect(candidate).toContain("CREATE OR REPLACE FUNCTION public.finalize_legacy_payment_submission");
  expect(candidate).toContain("SECURITY INVOKER");
  expect(candidate).toContain("SECURITY DEFINER");
  expect(candidate).toContain("SET search_path TO ''");
  expect(candidate).toContain("GRANT USAGE ON SCHEMA evolusystem_finance_private TO authenticated");
  expect(candidate).toContain("19VC_PRIVATE_HELPER_GRANTS_INVALID");
  expect(candidate).toContain("public.has_module_access(v_actor,'hub_os')");
  expect(candidate).toContain("p.created_by=v_actor");
  expect(candidate).toContain("'already_submitted',true");
  expect(candidate).toContain("'already_submitted',false");
 });
 it("copies 19V-A helper logic verbatim apart from intended privilege changes",()=>{
  const start="CREATE FUNCTION public.finalize_legacy_payment_submission(p_proof_id uuid)";
  const stop="$finalize$;";
  const originalBody=original.slice(original.indexOf(start),original.indexOf(stop,original.indexOf(start))+stop.length);
  const helperStart="CREATE FUNCTION evolusystem_finance_private.finalize_legacy_payment_submission(p_proof_id uuid)";
  const helper=candidate.slice(candidate.indexOf(helperStart),candidate.indexOf(stop,candidate.indexOf(helperStart))+stop.length);
  const expected=originalBody
   .replace("CREATE FUNCTION public.","CREATE FUNCTION evolusystem_finance_private.")
   .replace("SECURITY INVOKER","SECURITY DEFINER")
   .replace("IF current_user <> 'authenticated' OR v_actor IS NULL","IF v_actor IS NULL");
  expect(helper).toBe(expected);
 });
 it("guards operational columns, finance event writes and cascade deletion",()=>{
  expect(candidate).toContain("REVOKE UPDATE ON public.os FROM authenticated,anon");
  expect(candidate).toContain("GRANT UPDATE (customer_name");
  expect(candidate).toContain("19VC_DIRECT_FINANCIAL_EVENT_INSERT_BLOCKED");
  expect(candidate).toContain("19VC_DIRECT_FINANCIAL_EVENT_UPDATE_BLOCKED");
  expect(candidate).toContain("19VC_DIRECT_FINANCIAL_EVENT_DELETE_BLOCKED");
  expect(candidate).toContain("19VC_OS_WITH_FINANCIAL_ARTIFACT_DELETE_BLOCKED");
  expect(candidate).toContain("SELECT 1 FROM public.os_payment_proof p");
 });
 it("records unverified runtime gates and no unauthorized production rollout",()=>{
  expect(candidate).toContain("REVIEW CANDIDATE, NOT APPLIED");
  expect(review).toContain("não foi obtida");
  expect(review).toContain("Não executar testes sintéticos");
  expect(review).toContain("A 19V-C2 não foi");
  expect(rollback).toContain("Não é um script automático");
  expect(rollback).toContain("Nunca conceder novamente TRUNCATE");
 });
});
