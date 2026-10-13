import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20261013174703_restrict_legacy_admin_user_rpcs.sql",
  "utf8"
).replaceAll("\r\n", "\n");

describe("legacy admin user RPC hardening", () => {
  it("fails closed if either expected RPC is absent", () => {
    expect(sql).toContain("ADMIN_RPC_HARDENING_ABORTED_MISSING_FUNCTION");
  });

  it("revokes PUBLIC, anon and authenticated from both privileged RPCs", () => {
    for (const signature of [
      "create_user_by_admin(text,text,text)",
      "delete_user_by_admin(uuid)",
    ]) {
      expect(sql).toContain(
        `revoke execute on function public.${signature}\n  from public, anon, authenticated;`
      );
      expect(sql).toContain(
        `grant execute on function public.${signature}\n  to service_role;`
      );
    }
  });

  it("checks effective privileges and performs no user-data mutations", () => {
    expect(sql).toContain("ADMIN_RPC_HARDENING_ABORTED_UNEXPECTED_PERMISSIONS");
    expect(sql).toContain("has_function_privilege");
    expect(sql).not.toMatch(/\b(delete|insert|update)\s+(from\s+|into\s+)?(?:auth\.|public\.)/i);
  });
});
