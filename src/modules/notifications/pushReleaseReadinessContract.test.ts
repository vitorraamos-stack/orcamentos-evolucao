import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read=(path:string)=>readFileSync(path,"utf8");
const vercel=JSON.parse(read("vercel.json")) as {
  git:{deploymentEnabled:Record<string,boolean>};
  crons?:Array<{path:string;schedule:string}>;
};
const migration=read("supabase/migrations/20261111153110_pwa_v4_operational_push_dispatch.sql");
const dispatch=read("api/push/dispatch.ts");
const store=read("api/_shared/push/dispatchStore.ts");
const readiness=read("api/push/readiness.ts");

describe("PWA V4 — release checklist and hard stop",()=>{
  it("defers scheduled dispatch until Vercel secrets are ready",()=>{
    expect(vercel.crons ?? []).toEqual([]);
    expect(vercel.git.deploymentEnabled["feat/pwa-v4-release-readiness-20261111"]).toBe(false);
    expect(dispatch).toContain("authorizedCron");
    expect(dispatch).toContain('PWA_PUSH_ROLLOUT_ENABLED !== "true"');
    expect(dispatch).toContain('PWA_PUSH_GENERATION_ENABLED !== "true"');
    expect(dispatch).toContain('PWA_PUSH_DELIVERY_ENABLED !== "true"');
  });

  it("keeps BOTH database flags false and makes them owner-only",()=>{
    expect(migration).toContain("generation_enabled boolean not null default false");
    expect(migration).toContain("delivery_enabled boolean not null default false");
    expect(migration).toContain("values (true, false, false)");
    expect(migration).toContain("grant select on private.push_v4_runtime_settings to service_role;");
    expect(migration).not.toContain("grant update on private.push_v4_runtime_settings");
  });

  it("fences stale lease completions by attempt ID and lease validity",()=>{
    expect(migration).toContain("push_v4_job_eligible(p_job_id uuid, p_attempt_number integer)");
    expect(migration).toContain("j.attempt_count=p_attempt_number");
    expect(migration).toContain("p_expected_attempt integer");
    expect(migration).toContain("attempt_count=p_expected_attempt");
    expect(migration).toContain("lease_until > pg_catalog.now()");
    expect(store).toContain("p_expected_attempt: attemptNumber");
    expect(dispatch).toContain("store.eligible(job.job_id,job.attempt_number)");
    expect(dispatch).toContain("store.finish(job.job_id,job.attempt_number,outcome)");
  });

  it("readiness API has strictly read-only, secret protected summary",()=>{
    expect(readiness).toContain("authorizedCron");
    expect(readiness).toContain(".readiness()");
    expect(readiness).not.toContain(".claim(");
    expect(readiness).not.toContain(".expand(");
    expect(readiness).not.toContain(".finish(");
    expect(readiness).not.toContain("PWA_PUSH_VAPID_PRIVATE_KEY:"); // not a public response field
    expect(migration).toContain("public.push_v4_release_readiness()");
    expect(migration).toContain("revoke all on function public.push_v4_release_readiness()");
    expect(migration).toContain("grant execute on function public.push_v4_release_readiness() to service_role");
    expect(store).toContain('admin.rpc("push_v4_release_readiness")');
  });
});
