import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20261013180010_phase_19e_harden_profile_module_access.sql",
  "utf8"
).replaceAll("\r\n", "\n");

describe("19E profile and module access hardening", () => {
  it("fails closed when expected objects, policies, or privileges have changed", () => {
    for (const guard of [
      "19E_ABORTED_MISSING_SECURITY_OBJECT",
      "19E_ABORTED_PROFILES_RLS_DISABLED",
      "19E_ABORTED_PROFILE_POLICIES_CHANGED",
      "19E_ABORTED_UNEXPECTED_PROFILE_WRITE_POLICY",
      "19E_ABORTED_EXPECTED_SERVER_OR_CLIENT_ACCESS_MISSING",
    ]) {
      expect(sql).toContain(guard);
    }
  });

  it("restricts the privileged module RPC to the service role", () => {
    expect(sql).toContain(
      "revoke execute on function public.set_user_modules(uuid,text[])\n  from public, anon, authenticated;"
    );
    expect(sql).toContain(
      "grant execute on function public.set_user_modules(uuid,text[]) to service_role;"
    );
  });

  it("removes unsafe profile write policies without dropping read policies", () => {
    for (const policy of [
      "Acesso de Edição",
      "Apenas admins podem atualizar perfis",
      "Permitir atualizar perfis",
      "Permitir inserir perfil",
    ]) {
      expect(sql).toContain(`drop policy "${policy}" on public.profiles;`);
    }
    expect(sql).not.toMatch(/drop policy [^;]*leitura[^;]*on public\.profiles/i);
  });

  it("removes direct mutations while preserving authenticated reads and server writes", () => {
    expect(sql).toContain("revoke insert, update, delete, truncate, references, trigger\n  on table public.profiles from public, anon, authenticated;");
    expect(sql).toContain("has_table_privilege('authenticated','public.profiles','SELECT')");
    expect(sql).toContain("has_table_privilege('service_role','public.profiles','SELECT,INSERT,UPDATE')");
    expect(sql).toContain("19E_ABORTED_MODULE_RPC_ACCESS_CHECK");
    expect(sql).toContain("19E_ABORTED_PROFILES_ACCESS_CHECK");
    expect(sql).not.toMatch(/\b(?:insert into|update|delete from)\s+(?:public\.)?(?:profiles|user_module_access)\b/i);
  });
});
