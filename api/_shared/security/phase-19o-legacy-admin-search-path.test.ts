import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261014105000_phase_19o_legacy_admin_search_path.sql", "utf8").replaceAll("\r\n", "\n");
const functions = [{"name":"create_user_by_admin","types":"text,text,text","hash":"d0b3d48dd3a4295d2baa62e540fb4df0","path":"pg_catalog, extensions"},{"name":"delete_user_by_admin","types":"uuid","hash":"a94f3fe569ff3b72f689755aa3f1cbfe","path":""}];

describe("19O legacy administrative RPC search_path", () => {
  it("fails closed on changed implementation, privilege, owner or pgcrypto schema", () => {
    expect(sql).toContain("19O_ABORTED_UNTRUSTED_OR_MISSING_CRYPTO_SCHEMA");
    expect(sql).toContain("to_regprocedure('extensions.crypt(text,text)')");
    expect(sql).toContain("to_regprocedure('extensions.gen_salt(text)')");
    expect(sql).toContain("has_schema_privilege('authenticated','extensions','CREATE')");
    for (const f of functions) {
      expect(sql).toContain(`to_regprocedure('public.${f.name}(${f.types})')`);
      expect(sql).toContain(`md5(p.prosrc)='${f.hash}'`);
      expect(sql).toContain(`19O_ABORTED_PRECONDITION_${f.name.toUpperCase()}`);
      expect(sql).toContain(`19O_ABORTED_POSTCONDITION_${f.name.toUpperCase()}`);
    }
    expect(sql).toContain("p.proacl::text='{postgres=X/postgres,service_role=X/postgres}'");
  });

  it("pins exactly two functions with correct crypto resolution paths", () => {
    const changes = sql.match(/^ALTER FUNCTION public\..+$/gm) ?? [];
    expect(changes).toHaveLength(2);
    expect(changes).toContain("ALTER FUNCTION public.create_user_by_admin(text,text,text) SET search_path TO pg_catalog, extensions;");
    expect(changes).toContain("ALTER FUNCTION public.delete_user_by_admin(uuid) SET search_path TO '';");
    expect(sql).toContain("p.proconfig @> ARRAY['search_path=pg_catalog, extensions']::text[]");
    expect(sql).toContain("p.proconfig @> ARRAY['search_path=\"\"']::text[]");
  });

  it("preserves the legacy functions, accounts, role grants and RLS", () => {
    expect(sql).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO\s+|FROM\s+)?(?:public\.|auth\.)/im);
    expect(sql).not.toMatch(/^\s*(?:CREATE|DROP|ALTER)\s+POLICY\b/im);
    expect(sql).not.toMatch(/^\s*(?:REVOKE|GRANT)\s+/im);
    expect(sql).not.toMatch(/^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/im);
    expect(sql).not.toMatch(/^\s*DROP\s+FUNCTION\b/im);
    expect(sql).not.toMatch(/^\s*(?:CREATE|DROP|ALTER)\s+TRIGGER\b/im);
    expect(sql).toContain("Known pre-existing defect: create_user_by_admin references missing auth.users.password column.");
  });
});
