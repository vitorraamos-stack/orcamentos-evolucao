import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261111152913_pwa_v4_push_subscription_rpcs.sql", "utf8");
const api = readFileSync("api/push/subscriptions.ts", "utf8");
const config = readFileSync("api/push/config.ts", "utf8");
const helper = readFileSync("api/_shared/push/subscriptions.ts", "utf8");
const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
  git: { deploymentEnabled: Record<string, boolean> }; crons?: unknown[];
};

describe("Push V4: backend server-only contract", () => {
  it("creates only three invoker RPCs, with no trigger or cron", () => {
    expect((sql.match(/create or replace function public\.push_v4_/g) ?? []).length).toBe(3);
    expect((sql.match(/security invoker/g) ?? []).length).toBe(3);
    expect(sql.toLowerCase()).not.toContain("security definer");
    expect(sql.toLowerCase()).not.toMatch(/\bcreate\s+trigger\b/);
    expect(sql).not.toContain("cron.schedule");
    expect(sql).not.toContain("net.http_post");
  });

  it("revokes PUBLIC, anon and authenticated EXECUTE; permits only service role", () => {
    for (const signature of [
      "push_v4_register_subscription(uuid,text,text,text,text)",
      "push_v4_revoke_subscription(uuid,text)",
      "push_v4_subscription_status(uuid,text)",
    ]) {
      expect(sql).toContain("revoke all on function public." + signature);
      expect(sql).toContain("grant execute on function public." + signature);
    }
    expect((sql.match(/from public, anon, authenticated/g) ?? []).length).toBe(3);
    expect((sql.match(/to service_role/g) ?? []).length).toBe(3);
  });

  it("enforces ownership, module gate, global endpoint binding and device limit", () => {
    expect(sql).toContain("public.has_module_access(p_user_id, 'hub_os')");
    expect(sql).toContain("v_bound_user <> p_user_id");
    expect(sql).toContain("endpoint_bound");
    expect(sql).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(sql).toContain(">= 5");
    expect(sql).toContain("revoked_at is null");
    expect(sql).toContain("where user_id = p_user_id");
    expect(sql).not.toContain("grant usage on schema private to authenticated");
  });

  it("authenticates requests by verified JWT, never by user-supplied ID", () => {
    expect(helper).toContain("admin.auth.getUser(token)");
    expect(helper).toContain('admin.rpc("push_v4_register_subscription"');
    expect(api).toContain("store.getUser(bearer)");
    expect(api).toContain("store.register(userId, endpointHash");
    expect(api).toContain("store.revoke(userId, endpointHash");
    expect(api).not.toMatch(/req\.body\.userId|body\.userId/);
  });

  it("never includes a service key in client or public config", () => {
    expect(helper).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(config).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(config).not.toContain("PWA_PUSH_VAPID_PRIVATE_KEY");
    expect(config).toContain("publicKey");
  });

  it("requires explicit opt-in, blocks branch previews and does not schedule dispatch", () => {
    expect(helper).toContain('PWA_PUSH_REGISTRATION_ENABLED === "true"');
    expect(api).toContain("push_registration_disabled");
    expect(vercel.git.deploymentEnabled["feat/pwa-v4-server-subscriptions-20261111"]).toBe(false);
    expect(vercel.crons ?? []).toEqual([]);
    expect(sql).not.toContain("PWA_PUSH_REGISTRATION_ENABLED=true");
  });
});
