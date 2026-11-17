import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const sql = read("supabase/migrations/20261116103500_pwa_v4_canary_dispatch_scope.sql");
const dispatch = read("api/push/dispatch.ts");
const store = read("api/_shared/push/dispatchStore.ts");
const vercel = JSON.parse(read("vercel.json")) as { crons?: unknown[] };

describe("PWA V4 — fail-closed delivery pilot", () => {
  it("requires the canary allowlist before expanding or claiming any job", () => {
    expect(dispatch).toContain("pushCanaryUserIds(env)");
    expect(dispatch).toContain('code:"push_canary_configuration_missing"');
    expect(dispatch).toContain("store.expand(15,canaryUserIds)");
    expect(dispatch).toContain("store.claim(4,canaryUserIds)");
    expect(dispatch).toContain('PWA_PUSH_ROLLOUT_ENABLED !== "true"');
  });

  it("materializes events only for allowed recipients and claims only matching subscriptions", () => {
    expect(sql).toContain("public.push_v4_expand_canary_outbox(p_limit integer, p_allowed_user_ids uuid[])");
    expect(sql).toContain("public.push_v4_claim_canary_jobs(p_limit integer, p_allowed_user_ids uuid[])");
    expect(sql).toContain("and x.user_id = any(p_allowed_user_ids)");
    expect(sql).toContain("and s.user_id = any(p_allowed_user_ids)");
    expect(sql).toContain("and n.recipient_id = s.user_id");
    expect(sql).toContain("for update of j skip locked");
    expect(sql).toContain("pg_catalog.cardinality(p_allowed_user_ids) not between 1 and 5");
    expect(sql).toContain("public.has_module_access(x.user_id,v_evt.required_module)");
    expect(sql).toContain("on conflict (source_event_id,recipient_id) do nothing");
  });

  it("denies legacy unrestricted worker RPC access and leaves the sender unscheduled", () => {
    expect(sql).toContain("revoke execute on function public.push_v4_expand_outbox(integer) from service_role");
    expect(sql).toContain("revoke execute on function public.push_v4_claim_jobs(integer) from service_role");
    expect(sql).toContain("grant execute on function public.push_v4_expand_canary_outbox(integer,uuid[]) to service_role");
    expect(sql).toContain("grant execute on function public.push_v4_claim_canary_jobs(integer,uuid[]) to service_role");
    expect(sql).not.toMatch(/grant\s+execute[^;]*to\s+authenticated/i);
    expect(sql).not.toMatch(/update\s+private\.push_v4_runtime_settings/i);
    expect(store).toContain('admin.rpc("push_v4_expand_canary_outbox"');
    expect(store).toContain('admin.rpc("push_v4_claim_canary_jobs"');
    expect(vercel.crons ?? []).toEqual([{path:"/api/push/dispatch",schedule:"*/2 * * * *"}]);
  });
});
