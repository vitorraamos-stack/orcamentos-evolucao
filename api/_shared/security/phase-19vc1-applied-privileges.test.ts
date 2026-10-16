import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration=readFileSync(
 "supabase/migrations/20261016124926_phase_19vc1_revoke_dangerous_legacy_table_privileges.sql","utf8"
);
const note=readFileSync("docs/tasks/phase-19vc1-applied-privileges.md","utf8");
const candidate=readFileSync("docs/tasks/phase-19vc-financial-write-guards-CANDIDATE.sql","utf8");

describe("19V-C1 — applied migration history",()=>{
 it("records exact Supabase version and safety checkpoints",()=>{
  expect(note).toContain("20261016124926_phase_19vc1_revoke_dangerous_legacy_table_privileges");
  expect(migration).toContain("19VC1_FINANCE_FUNCTION_DRIFT");
  expect(migration).toContain("19VC1_OPERATIONAL_PRIVILEGE_REGRESSION");
 });
 it("removes only administrative privileges from client roles",()=>{
  expect(migration).toContain("REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE");
  expect(migration).toContain("public.os, public.os_event, public.os_payment_proof");
  expect(migration).toContain("FROM anon, authenticated;");
  expect(migration).not.toContain("CREATE OR REPLACE FUNCTION");
  expect(migration).not.toContain("ALTER POLICY");
  expect(migration).not.toContain("DROP TABLE");
  expect(migration).not.toContain("UPDATE public.os");
 });
 it("keeps larger finance upgrade explicitly separate",()=>{
  expect(candidate).toContain("DESIGN CANDIDATE, NOT APPLIED");
  expect(note).toContain("Remaining 19V-C2 work");
 });
});
