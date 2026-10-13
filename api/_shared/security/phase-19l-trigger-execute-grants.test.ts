import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261013195500_phase_19l_trigger_execute_grants.sql", "utf8").replaceAll("\r\n","\n");
const functions = [{"name":"handle_new_user","trigger":"on_auth_user_created","table":"auth.users","event":"AFTER INSERT ON auth.users","body":"insert into public.profiles","grant":"authenticated, service_role, supabase_auth_admin"},{"name":"os_finance_installment_audit_trigger","trigger":"trg_os_finance_installment_audit","table":"public.os_finance_installments","event":"AFTER UPDATE OF status, notes ON os_finance_installments","body":"FINANCE_INSTALLMENT_STATUS_CHANGED","grant":"authenticated, service_role"}];

describe("19L privileged trigger function grants", () => {
  it("fails closed if either active trigger or privileged function changed", () => {
    expect(sql).toContain("DO $preflight$");
    expect(sql).toContain("DO $postcheck$");
    expect(sql).toContain("19L_ABORTED_AUTH_BACKEND_ROLE_MISSING");
    for (const f of functions) {
      expect(sql).toContain(`19L_ABORTED_UNEXPECTED_FUNCTION_${f.name.toUpperCase()}`);
      expect(sql).toContain(`19L_ABORTED_UNEXPECTED_TRIGGER_${f.trigger.toUpperCase()}`);
      expect(sql).toContain(`19L_ABORTED_POSTCONDITION_${f.name.toUpperCase()}`);
      expect(sql).toContain(`t.tgrelid='${f.table}'::regclass`);
      expect(sql).toContain(`t.tgname='${f.trigger}'`);
      expect(sql).toContain(`pg_get_triggerdef(t.oid,true) LIKE '%${f.event}%'`);
      expect(sql).toContain(`p.prosrc LIKE '%${f.body}%'`);
    }
  });

  it("revokes anonymous/public EXECUTE and preserves backend grants", () => {
    for (const f of functions) {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${f.name}() FROM PUBLIC, anon;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${f.name}() TO ${f.grant};`);
      expect(sql).toContain(`has_function_privilege('anon','public.${f.name}()','EXECUTE')`);
    }
    expect(sql).toContain("has_function_privilege('supabase_auth_admin','public.handle_new_user()','EXECUTE')");
  });

  it("never changes trigger definitions, tables, or function bodies", () => {
    expect(sql).not.toMatch(/\b(?:CREATE|DROP|ALTER)\s+TRIGGER\b/i);
    expect(sql).not.toMatch(/\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/i);
    expect(sql).not.toMatch(/\b(?:INSERT\s+INTO|DELETE\s+FROM|UPDATE)\s+(?:public\.|auth\.)/i);
    expect((sql.match(/^REVOKE EXECUTE ON FUNCTION public\./gm) || []).length).toBe(2);
    expect((sql.match(/^GRANT EXECUTE ON FUNCTION public\./gm) || []).length).toBe(2);
  });
});
