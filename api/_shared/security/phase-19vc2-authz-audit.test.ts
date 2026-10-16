import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
 "docs/tasks/phase-19vc2-financial-enforcement-CANDIDATE.sql", "utf8"
);
const review = readFileSync(
 "docs/tasks/phase-19vc2-authz-read-only-audit.md", "utf8"
);

describe("19V-C2 read-only security review", () => {
 it("never misrepresents definer reads as invoker RLS", () => {
  expect(sql).toContain("SECURITY DEFINER bypasses RLS");
  expect(sql).not.toContain("Discover under RLS");
  expect(sql).toContain("p.created_by=v_actor");
  expect(sql).toContain("public.has_module_access(v_actor,'hub_os')");
 });
 it("keeps the unverified Data API exposure as a blocker", () => {
  expect(review).toContain("Não confirmou os schemas expostos");
  expect(review).toContain("NÃO verificados");
  expect(review).toContain("não liberar aplicação de 19V-C2");
 });
});
