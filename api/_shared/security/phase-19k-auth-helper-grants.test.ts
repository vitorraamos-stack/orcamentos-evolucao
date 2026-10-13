import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261013194000_phase_19k_restrict_anon_auth_helpers.sql", "utf8").replaceAll("\r\n", "\n");
const helpers = [{"name":"has_module_access","sig":"uuid,text","guard":"uma.user_id = uid"},{"name":"is_admin","sig":"uuid","guard":"p.role in ('admin', 'gerente')"},{"name":"is_manager","sig":"uuid","guard":"p.role in ('admin', 'gerente')"}];

describe("19K anonymous privilege hardening for RLS helpers", () => {
  it("rejects any accidental anonymous/public RLS policy dependency", () => {
    expect(sql).toContain("19K_ABORTED_ANONYMOUS_POLICY_DEPENDENCY");
    expect(sql).toContain("roles && ARRAY['anon','public']::name[]");
    expect(sql).toContain("coalesce(qual,'') || coalesce(with_check,'')");
  });

  it("requires existing definer helper bodies, actor permissions, and result type", () => {
    for (const { name, sig, guard } of helpers) {
      expect(sql).toContain(`19K_ABORTED_UNEXPECTED_HELPER_${name.toUpperCase()}`);
      expect(sql).toContain(`to_regprocedure('public.${name}(${sig})')`);
      expect(sql).toContain(guard.replaceAll("'", "''"));
      expect(sql).toContain("p.prosecdef");
      expect(sql).toContain("p.prorettype = 'boolean'::regtype");
    }
  });

  it("blocks anon and preserves authenticated and service-role execution", () => {
    for (const { name, sig } of helpers) {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${name}(${sig}) FROM PUBLIC, anon;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${name}(${sig}) TO authenticated, service_role;`);
      expect(sql).toContain(`19K_ABORTED_HELPER_POSTCONDITION_${name.toUpperCase()}`);
    }
  });

  it("does not alter rows, policies, trigger functions, or helper implementations", () => {
    expect(sql).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION/i);
    expect(sql).not.toMatch(/\b(?:CREATE|DROP|ALTER)\s+(?:POLICY|TRIGGER)\b/i);
    expect(sql).not.toMatch(/\b(?:INSERT\s+INTO|DELETE\s+FROM|UPDATE)\s+public\./i);
    expect(sql).not.toContain("REVOKE EXECUTE ON FUNCTION public.handle_new_user");
    expect(sql).not.toContain("REVOKE EXECUTE ON FUNCTION public.os_finance_installment_audit_trigger");
  });
});
