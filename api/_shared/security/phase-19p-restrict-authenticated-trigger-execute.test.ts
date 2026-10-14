import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261014115500_phase_19p_restrict_authenticated_trigger_execute.sql", "utf8").replaceAll("\r\n", "\n");
const targets = [{"name":"handle_new_user","hash":"f68b64ac522c5569117b4c2c7a4241a9","oldAcl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,supabase_auth_admin=X/postgres}","newAcl":"{postgres=X/postgres,service_role=X/postgres,supabase_auth_admin=X/postgres}","trigger":"on_auth_user_created","table":"auth.users","def":"CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user()","admin":true},{"name":"os_finance_installment_audit_trigger","hash":"df7e652e9ec347cdd3583209e9b0d44f","oldAcl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}","newAcl":"{postgres=X/postgres,service_role=X/postgres}","trigger":"trg_os_finance_installment_audit","table":"public.os_finance_installments","def":"CREATE TRIGGER trg_os_finance_installment_audit AFTER UPDATE OF status, notes ON os_finance_installments FOR EACH ROW EXECUTE FUNCTION os_finance_installment_audit_trigger()","admin":false}];

describe("19P authenticated EXECUTE removed from privileged trigger functions", () => {
  it("fails closed on unexpected trigger definitions and function ownership, body, or ACL", () => {
    expect(sql).toContain("DO $preflight$");
    expect(sql).toContain("DO $postcheck$");
    expect(sql).toContain("19P_ABORTED_AUTH_BACKEND_MISSING");
    for (const f of targets) {
      expect(sql).toContain(`to_regprocedure('public.${f.name}()')`);
      expect(sql).toContain(`md5(p.prosrc)='${f.hash}'`);
      expect(sql).toContain(`p.proacl::text='${f.oldAcl}'`);
      expect(sql).toContain(`p.proacl::text='${f.newAcl}'`);
      expect(sql).toContain(`t.tgname='${f.trigger}'`);
      expect(sql).toContain(`t.tgrelid='${f.table}'::regclass`);
      expect(sql).toContain(`pg_get_triggerdef(t.oid,true)='${f.def}'`);
      expect(sql).toContain(`19P_ABORTED_PRECONDITION_${f.name.toUpperCase()}`);
      expect(sql).toContain(`19P_ABORTED_POSTCONDITION_${f.name.toUpperCase()}`);
    }
    expect(sql).toContain("has_function_privilege('supabase_auth_admin',p.oid,'EXECUTE')");
    expect(sql).toContain("has_function_privilege('service_role',p.oid,'EXECUTE')");
    expect(sql).toContain("p.prorettype='trigger'::regtype");
  });

  it("changes only authenticated EXECUTE on the two exact existing signatures", () => {
    const revokes = sql.match(/^REVOKE EXECUTE ON FUNCTION .+$/gm) ?? [];
    expect(revokes).toHaveLength(2);
    for (const f of targets) {
      expect(revokes).toContain(`REVOKE EXECUTE ON FUNCTION public.${f.name}() FROM authenticated;`);
    }
    expect(sql).not.toMatch(/^GRANT\s+/gm);
  });

  it("never modifies user/finance data, triggers, RLS policies, or function bodies", () => {
    expect(sql).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO\s+|FROM\s+)?(?:public\.|auth\.)/im);
    expect(sql).not.toMatch(/^\s*(?:CREATE|ALTER|DROP)\s+TRIGGER\b/im);
    expect(sql).not.toMatch(/^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/im);
    expect(sql).not.toMatch(/^\s*ALTER\s+FUNCTION\b/im);
    expect(sql).not.toMatch(/^\s*(?:CREATE|ALTER|DROP)\s+POLICY\b/im);
  });
});
