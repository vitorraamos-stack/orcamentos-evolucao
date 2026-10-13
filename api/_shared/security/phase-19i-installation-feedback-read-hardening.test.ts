import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261013191000_phase_19i_installation_feedback_read_hardening.sql", "utf8").replaceAll("\r\n", "\n");
const signatures = {"installation_feedback_mark_reviewed_secure":"uuid","installation_feedbacks_list_secure":""};

describe("19I installation feedback confidentiality hardening", () => {
  it("fails closed if feedback table and privileged RPC contracts change", () => {
    for (const guard of [
      "19I_ABORTED_FEEDBACK_TABLE_POLICY_CHANGED",
      "19I_ABORTED_FEEDBACK_ACCESS_CONTRACT_CHANGED",
      "19I_ABORTED_FEEDBACK_RLS_POSTCONDITION",
    ]) expect(sql).toContain(guard);
  });

  it("permits direct SELECT only to authenticated Hub OS managers", () => {
    expect(sql).toContain('DROP POLICY "os_installation_feedbacks_select_authenticated"');
    expect(sql).toContain('FOR SELECT TO authenticated');
    expect(sql).toContain("public.is_admin((select auth.uid()))");
    expect(sql).toContain("public.has_module_access((select auth.uid()), 'hub_os')");
    expect(sql).toContain("(select auth.uid()) IS NOT NULL");
    for (const cmd of ["INSERT", "UPDATE", "DELETE"]) expect(sql).toContain("cmd='" + cmd + "'");
  });

  it("retains manager guards and denies anon on privileged feedback RPCs", () => {
    for (const [name, sig] of Object.entries(signatures)) {
      const offset = sql.indexOf("CREATE OR REPLACE FUNCTION public." + name + "(");
      expect(offset).toBeGreaterThan(-1);
      const definition = sql.slice(offset, sql.indexOf("$function$;", offset));
      expect(definition).toContain("KIOSK_MANAGER_REQUIRED");
      expect(definition).toContain("INSTALLATION_FEEDBACK_HUB_MODULE_REQUIRED");
      expect(definition).toContain("public.has_module_access(auth.uid(), 'hub_os')");
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${name}(${sig}) FROM PUBLIC, anon;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${name}(${sig}) TO authenticated, service_role;`);
    }
  });

  it("does not run direct row mutations outside the preserved RPC bodies", () => {
    const migrationDdl = sql.slice(0, sql.indexOf("-- Keep manager-only feedback RPC semantics"));
    expect(migrationDdl).not.toMatch(/(?:DELETE FROM|INSERT INTO|UPDATE)\s+public\.os_installation_feedbacks\b/i);
  });
});
