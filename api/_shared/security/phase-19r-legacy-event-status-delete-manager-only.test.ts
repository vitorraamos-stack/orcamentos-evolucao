import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261014162000_phase_19r_legacy_event_status_delete_manager_only.sql", "utf8").replaceAll("\r\n", "\n");
const targets = [{"table":"os_event","policy":"os_event_delete"},{"table":"os_status","policy":"os_status_delete"}];

describe("19R legacy event and status DELETE policy hardening", () => {
  it("fails closed on policy, helper, or dependency drift", () => {
    expect(sql).toContain("19R_ABORTED_SECURITY_HELPERS_CHANGED");
    expect(sql).toContain("19R_ABORTED_19Q_LEGACY_OS_CHANGED");
    expect(sql).toContain("19R_ABORTED_PAYMENT_PROOF_CLEANUP_POLICY_CHANGED");
    expect(sql).toContain("19R_ABORTED_POSTCONDITION_REFERENCE_POLICIES");
    expect(sql).toContain("md5(p.prosrc)='5855f6a54a28a3f37f3c2702a5b0ac82'");
    expect(sql).toContain("md5(p.prosrc)='6c4acc49a3edd1a6b8b775f05e1e1e4f'");
    for (const f of targets) {
      expect(sql).toContain(`19R_ABORTED_PRECONDITION_${f.table.toUpperCase()}`);
      expect(sql).toContain(`19R_ABORTED_POSTCONDITION_${f.table.toUpperCase()}`);
      expect(sql).toContain(`policyname='${f.policy}'`);
      expect(sql).toContain(`tablename='${f.table}'`);
      expect(sql).toContain("roles=ARRAY['authenticated']::name[]");
      expect(sql).toContain("c.relrowsecurity");
    }
  });

  it("changes exactly two DELETE policies, without restricting legacy payment cleanup", () => {
    const alterCommands = sql.match(/^ALTER POLICY .+$/gm) ?? [];
    expect(alterCommands).toEqual(
      targets.map(f => `ALTER POLICY ${f.policy} ON public.${f.table}`)
    );
    for (const f of targets) {
      expect(sql).toContain("USING (public.has_module_access(auth.uid(), 'hub_os') AND public.is_manager(auth.uid()));");
    }
    expect(sql).not.toMatch(/^ALTER POLICY os_payment_delete\b/m);
    expect(sql).not.toMatch(/^ALTER POLICY os_delete\b/m);
    expect(sql).toContain("frontend invokes deletePaymentProof()");
  });

  it("preserves all data, function bodies, grants, triggers, and other policies", () => {
    expect(sql).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO\s+|FROM\s+)?(?:public\.|auth\.)/im);
    expect(sql).not.toMatch(/^\s*(?:CREATE|DROP)\s+POLICY\b/im);
    expect(sql).not.toMatch(/^\s*(?:REVOKE|GRANT)\s+/im);
    expect(sql).not.toMatch(/^\s*(?:CREATE|ALTER|DROP)\s+FUNCTION\b/im);
    expect(sql).not.toMatch(/^\s*(?:CREATE|ALTER|DROP)\s+TRIGGER\b/im);
    expect(sql).not.toMatch(/^ALTER POLICY .+ON public\.os_orders\b/m);
  });
});
