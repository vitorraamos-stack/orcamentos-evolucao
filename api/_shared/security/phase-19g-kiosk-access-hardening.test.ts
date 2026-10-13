import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261013183000_phase_19g_kiosk_access_hardening.sql","utf8").replaceAll("\r\n","\n");
const functions = {"kiosk_board_cleanup_orphans_secure":"text","kiosk_board_complete_installation_secure":"text,text,uuid,text","kiosk_board_move_secure":"text,text,uuid,text","kiosk_board_register_by_code":"text,uuid,text","kiosk_board_register_secure":"text,uuid,text,uuid,text"};

describe("19G kiosk RLS and privileged RPC hardening", () => {
 it("fails closed on database contract changes", () => {
  expect(sql).toContain("19G_ABORTED_KIOSK_POLICIES_CHANGED");
  expect(sql).toContain("19G_ABORTED_NO_AUTHORIZED_KIOSK_USERS");
  expect(sql).toContain("19G_ABORTED_RLS_POSTCONDITION");
 });
 it("restricts table access to both modules", () => {
  for(const cmd of ["SELECT","INSERT","UPDATE","DELETE"]) expect(sql).toContain(`FOR ${cmd} TO authenticated`);
  expect(sql).toContain("public.has_module_access((select auth.uid()), 'hub_os')");
  expect(sql).toContain("public.has_module_access((select auth.uid()), 'hub_os_kiosk')");
 });
 it("protects all five privileged kiosk wrappers", () => {
  for(const [name,args] of Object.entries(functions)){
   expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${name}(${args}) FROM PUBLIC, anon;`);
   expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${name}(${args}) TO authenticated, service_role;`);
   const start=sql.indexOf("CREATE OR REPLACE FUNCTION public."+name+"(");
   const end=sql.indexOf("$function$;",start);
   const definition=sql.slice(start,end);
   expect(start).toBeGreaterThan(-1);
   expect(definition).toContain("KIOSK_MODULE_REQUIRED");
   expect(definition).toContain("if auth.uid() is null then");
  }
 });
 it("uses the signed-in identity, never the caller supplied actor id", () => {
  expect(sql).not.toContain("v_actor_id := coalesce(p_actor_id, auth.uid());");
  expect(sql.match(/v_actor_id := auth.uid\(\);/g) ?? []).toHaveLength(4);
 });
});
