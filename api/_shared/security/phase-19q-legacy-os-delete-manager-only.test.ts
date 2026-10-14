import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261014150500_phase_19q_legacy_os_delete_manager_only.sql", "utf8").replaceAll("\r\n", "\n");

describe("19Q legacy public.os DELETE restricted to managers", () => {
  it("fails closed if policies or module/manager helpers drift", () => {
    expect(sql).toContain("19Q_ABORTED_LEGACY_OS_TABLE_CHANGED");
    expect(sql).toContain("19Q_ABORTED_OS_DELETE_POLICY_CHANGED");
    expect(sql).toContain("19Q_ABORTED_CURRENT_OS_DELETE_REFERENCE_CHANGED");
    expect(sql).toContain("19Q_ABORTED_RLS_HELPERS_CHANGED");
    expect(sql).toContain("19Q_ABORTED_POSTCONDITION_OS_DELETE");
    expect(sql).toContain("19Q_ABORTED_POSTCONDITION_ACTIVE_OS_DELETE");
    expect(sql).toContain("md5(p.prosrc)='5855f6a54a28a3f37f3c2702a5b0ac82'");
    expect(sql).toContain("md5(p.prosrc)='6c4acc49a3edd1a6b8b775f05e1e1e4f'");
    expect(sql).toContain("roles=ARRAY['authenticated']::name[]");
    expect(sql).toContain("tablename='os_orders'");
  });

  it("narrows exactly one legacy policy to authenticated Hub OS managers", () => {
    const commands = sql.match(/^ALTER POLICY .+$/gm) ?? [];
    expect(commands).toEqual(["ALTER POLICY os_delete ON public.os"]);
    expect(sql).toContain("USING (public.has_module_access(auth.uid(), 'hub_os') AND public.is_manager(auth.uid()));");
    expect(sql).toContain("qual='(has_module_access(auth.uid(), ''hub_os''::text) AND is_manager(auth.uid()))'");
  });

  it("does not alter the active OS system, privileges, functions, triggers or data", () => {
    expect(sql).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO\s+|FROM\s+)?(?:public\.|auth\.)/im);
    expect(sql).not.toMatch(/^\s*(?:CREATE|DROP)\s+POLICY\b/im);
    expect(sql).not.toMatch(/^\s*(?:REVOKE|GRANT)\s+/im);
    expect(sql).not.toMatch(/^\s*(?:CREATE|ALTER|DROP)\s+FUNCTION\b/im);
    expect(sql).not.toMatch(/^\s*(?:CREATE|ALTER|DROP)\s+TRIGGER\b/im);
    expect(sql).not.toMatch(/^ALTER POLICY .+ON public\.os_orders/m);
  });
});
