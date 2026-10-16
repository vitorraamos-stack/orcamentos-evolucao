import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const candidate=readFileSync(
 "docs/tasks/phase-19vc2-financial-enforcement-CANDIDATE.sql","utf8"
);
const audit=readFileSync(
 "docs/tasks/phase-19vc2-read-only-authorization-gates.sql","utf8"
);
const review=readFileSync(
 "docs/tasks/phase-19vc2-auth-dependency-audit.md","utf8"
);

describe("19V-C2 read-only authorization dependency contract",()=>{
 it("blocks C2 if existing privileged authorizers drift",()=>{
  expect(candidate).toContain("19VC2_AUTHORIZATION_DEPENDENCY_DRIFT");
  expect(candidate).toContain("5855f6a54a28a3f37f3c2702a5b0ac82");
  expect(candidate).toContain("6c4acc49a3edd1a6b8b775f05e1e1e4f");
  expect(candidate).toContain("user_module_access_insert_manager");
  expect(candidate).toContain("has_function_privilege(");
  expect(candidate).toContain("p.with_check='is_manager(auth.uid())'");
 });
 it("keeps reproducible metadata checks READ-ONLY",()=>{
  expect(audit).toContain("SELECT");
  expect(audit).toContain("module_authorizer_matches_baseline");
  expect(audit).toContain("manager_authorizer_matches_baseline");
  expect(audit).toContain("module_insert_requires_manager");
  for(const prohibited of [
    "INSERT INTO", "UPDATE public.", "DELETE FROM", "CREATE OR REPLACE",
    "ALTER TABLE", "TRUNCATE TABLE", "REVOKE ", "GRANT ", "SET ROLE"
  ]) expect(audit).not.toContain(prohibited);
 });
 it("records unverified API settings and no production finance migration",()=>{
  expect(review).toContain("não prova");
  expect(review).toContain("não executar a 19V-C2 em produção");
  expect(candidate).toContain("REVIEW CANDIDATE, NOT APPLIED");
 });
});
