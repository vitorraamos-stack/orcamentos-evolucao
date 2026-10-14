import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261014095500_phase_19n_kiosk_search_path_hardening.sql", "utf8").replaceAll("\r\n", "\n");
const funcs = [{"name":"kiosk_board_cleanup_orphans","types":"text","result":"record","hash":"8c0c40661ffcf23390f304a488873845"},{"name":"kiosk_board_complete_installation","types":"text,text,uuid,text","result":"record","hash":"7a71983676c971951d4b982c8c59664d"},{"name":"kiosk_board_list","types":"","result":"public.os_kiosk_board","hash":"58ce3dd82b1359bc2eed1896f7137a4f"},{"name":"kiosk_board_move","types":"text,text,uuid,text","result":"record","hash":"4c597bf99a69a2a68183c3ae5f97892f"},{"name":"kiosk_board_refresh_snapshot","types":"text","result":"public.os_kiosk_board","hash":"bbc4ba31651f7c6d021198562bd5087a"},{"name":"kiosk_board_register","types":"text,uuid,text,uuid,text","result":"public.os_kiosk_board","hash":"44f367d7fe5133274571206000cbf915"}];

describe("19N kiosk search_path hardening", () => {
  it("fails closed on unexpected function bodies, role grants or return types", () => {
    for (const f of funcs) {
      expect(sql).toContain(`to_regprocedure('public.${f.name}(${f.types})')`);
      expect(sql).toContain(`md5(p.prosrc)='${f.hash}'`);
      expect(sql).toContain(`p.prorettype='${f.result}'::regtype`);
      expect(sql).toContain(`19N_ABORTED_PRECONDITION_${f.name.toUpperCase()}`);
      expect(sql).toContain(`19N_ABORTED_POSTCONDITION_${f.name.toUpperCase()}`);
    }
    expect(sql).toContain("NOT p.prosecdef");
    expect(sql).toContain("has_function_privilege('anon',p.oid,'EXECUTE')");
    expect(sql).toContain("has_function_privilege('authenticated',p.oid,'EXECUTE')");
    expect(sql).toContain("has_function_privilege('service_role',p.oid,'EXECUTE')");
  });

  it("pins exactly six specific functions to the PostgreSQL empty search path", () => {
    const changes = sql.match(/^ALTER FUNCTION .+$/gm) ?? [];
    expect(changes).toHaveLength(6);
    for (const f of funcs) {
      expect(changes).toContain(`ALTER FUNCTION public.${f.name}(${f.types}) SET search_path TO '';`);
    }
    // PostgreSQL normalizes the empty path in proconfig with quotes.
    expect(sql).toContain("p.proconfig @> ARRAY['search_path=\"\"']::text[]");
  });

  it("does not mutate data, access policy, function bodies or user administration", () => {
    expect(sql).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO\s+|FROM\s+)?(?:public\.|auth\.)/im);
    expect(sql).not.toMatch(/^\s*(?:CREATE|ALTER|DROP)\s+TRIGGER\b/im);
    expect(sql).not.toMatch(/^\s*(?:CREATE|ALTER|DROP)\s+POLICY\b/im);
    expect(sql).not.toMatch(/^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/im);
    expect(sql).not.toMatch(/^\s*(?:REVOKE|GRANT)\s+/im);
    expect(sql).not.toMatch(/^ALTER FUNCTION public\.(?:create_user_by_admin|delete_user_by_admin)/m);
  });
});
