import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261013184500_phase_19h_order_flow_write_hardening.sql", "utf8").replaceAll("\r\n", "\n");
const rpcSigs = {"order_flow_list_secure":"","order_flow_mark_retirado_secure":"text,text,uuid","order_flow_set_avisado_secure":"text,text,uuid,boolean"};

describe("19H order-flow write hardening", () => {
  it("fails closed if existing policies, grants or functions drift", () => {
    expect(sql).toContain("19H_ABORTED_TABLE_CONTRACT_CHANGED");
    expect(sql).toContain("19H_ABORTED_TABLE_GRANTS_CHANGED");
    expect(sql).toContain("19H_ABORTED_TABLE_POSTCONDITION");
    expect(sql).toContain("19H_ABORTED_RPC_POSTCONDITION_");
  });

  it("preserves read and realtime while denying direct flow writes", () => {
    expect(sql).toContain('DROP POLICY "hub_os_order_flow_state_insert_authenticated"');
    expect(sql).toContain('DROP POLICY "hub_os_order_flow_state_update_authenticated"');
    expect(sql).not.toContain('DROP POLICY "hub_os_order_flow_state_select_authenticated"');
    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("has_table_privilege('authenticated','public.hub_os_order_flow_state','SELECT')");
  });

  it("preserves authenticated RPCs and revokes anonymous execution", () => {
    for (const [name, signature] of Object.entries(rpcSigs)) {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${name}(${signature}) FROM PUBLIC, anon;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${name}(${signature}) TO authenticated, service_role;`);
    }
  });

  it("rejects mismatched or missing sources before writing flow state", () => {
    for (const name of ["order_flow_mark_retirado_secure", "order_flow_set_avisado_secure"]) {
      const start = sql.indexOf("CREATE OR REPLACE FUNCTION public." + name + "(");
      const end = sql.indexOf("$function$;", start);
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      const definition = sql.slice(start, end);
      expect(definition).toContain("ORDER_FLOW_IDENTITY_MISMATCH");
      expect(definition).toContain("ORDER_FLOW_SOURCE_NOT_FOUND");
      expect(definition).toContain("p_order_key IS DISTINCT FROM p_source_type || ':' || p_source_id::text");
      expect(definition).toContain("SELECT 1 FROM public.os_orders WHERE id = p_source_id");
      expect(definition.indexOf("ORDER_FLOW_SOURCE_NOT_FOUND")).toBeLessThan(definition.indexOf("insert into public.hub_os_order_flow_state"));
      expect(definition).toContain("on conflict (order_key)");
    }
  });
});
