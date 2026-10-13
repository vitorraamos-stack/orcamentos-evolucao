import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261013192500_phase_19j_restrict_anon_mutation_rpcs.sql", "utf8").replaceAll("\r\n", "\n");
const mutations = [{"name":"update_os_order_consultor","signature":"uuid,jsonb","guards":["has_module_access(v_uid, 'hub_os')","v_uid uuid := auth.uid()"]},{"name":"upsert_material_with_tiers","signature":"uuid,text,text,text,text,numeric,text,jsonb","guards":["public.is_manager(v_uid)","v_uid uuid := auth.uid()"]}];

describe("19J privileged mutation RPCs", () => {
  it("fails closed before changing function privileges", () => {
    expect(sql).toContain("DO $preflight$");
    expect(sql).toContain("DO $postcheck$");
    for (const rpc of mutations) {
      expect(sql).toContain(`19J_ABORTED_UNEXPECTED_RPC_${rpc.name.toUpperCase()}`);
      expect(sql).toContain(`19J_ABORTED_RPC_POSTCONDITION_${rpc.name.toUpperCase()}`);
    }
  });

  it("revokes anonymous and public execution but preserves authenticated and service-role execution", () => {
    for (const { name, signature } of mutations) {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${name}(${signature}) FROM PUBLIC, anon;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${name}(${signature}) TO authenticated, service_role;`);
      expect(sql).toContain(`NOT has_function_privilege('authenticated', 'public.${name}(${signature})', 'EXECUTE')`);
      expect(sql).toContain(`has_function_privilege('anon', 'public.${name}(${signature})', 'EXECUTE')`);
    }
  });

  it("preserves established user and business access checks", () => {
    for (const { guards } of mutations) {
      for (const guard of guards) expect(sql).toContain(guard.replaceAll("'", "''"));
    }
  });

  it("does not redefine RPC implementations or write business records", () => {
    expect(sql).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION/i);
    expect(sql).not.toMatch(/\b(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+(?:public\.)?(?:os_orders|os_orders_event|materials|price_tiers)\b/i);
  });
});
