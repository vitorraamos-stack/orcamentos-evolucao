import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const read=(file:string)=>readFileSync(file,"utf8");
const cfg=JSON.parse(read("vercel.json")) as {crons?:Array<{path:string;schedule:string}>};
const dispatch=read("api/push/dispatch.ts");
const store=read("api/_shared/push/dispatchStore.ts");
const sql=read("supabase/migrations/20261116103500_pwa_v4_canary_dispatch_scope.sql");

describe("PWA V4: operating pilot boundaries",()=>{
  it("uses a single scheduled, secret-protected endpoint, still gated by three server flags",()=>{
    expect(cfg.crons).toEqual([{path:"/api/push/dispatch",schedule:"*/2 * * * *"}]);
    expect(dispatch).toContain("authorizedCron");
    expect(dispatch).toContain('PWA_PUSH_ROLLOUT_ENABLED !== "true"');
    expect(dispatch).toContain('PWA_PUSH_GENERATION_ENABLED !== "true"');
    expect(dispatch).toContain('PWA_PUSH_DELIVERY_ENABLED !== "true"');
  });
  it("only delivers the three approved kinds",()=>{
    expect(dispatch).toContain('"assignment", "production_released", "installation_scheduled"');
    expect(dispatch).toContain("PILOT_OPERATIONAL_KINDS.has(job.kind)");
    expect(dispatch).toContain('outcome:"discarded"');
  });
  it("cannot materialize or claim jobs for users beyond the canary",()=>{
    expect(dispatch).toContain("pushCanaryUserIds(env)");
    expect(dispatch).toContain("canaryUserIds.length !== 1");
    expect(store).toContain('admin.rpc("push_v4_expand_canary_outbox"');
    expect(store).toContain('admin.rpc("push_v4_claim_canary_jobs"');
    expect(sql).toContain("and x.user_id = any(p_allowed_user_ids)");
    expect(sql).toContain("and s.user_id = any(p_allowed_user_ids)");
    expect(sql).toContain("and n.recipient_id = s.user_id");
    expect(sql).toContain("revoke execute on function public.push_v4_claim_jobs(integer) from service_role");
  });
});
