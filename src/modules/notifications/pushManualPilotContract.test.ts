import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const read=(path:string)=>readFileSync(path,"utf8");
const sql=read("supabase/migrations/20261116111000_pwa_v4_manual_pilot_test.sql");
const api=read("api/push/pilot-test.ts");
const ui=read("src/components/notifications/PushNotificationPreferences.tsx");
const worker=read("public/sw.js");
const config=read("api/push/config.ts");
const vercel=JSON.parse(read("vercel.json")) as {crons?:unknown[]};

describe("PWA V4 — OS-free manual pilot test contract",()=>{
  it("keeps the entire operational sender disabled and requires separate explicit server flag",()=>{
    expect(api).toContain('PWA_PUSH_PILOT_TEST_ENABLED!=="true"');
    expect(api).toContain("isPushRegistrationEnabled(env)");
    expect(api).toContain("canRegisterPushUser(env,userId)");
    expect(api).toContain("getBearer");
    expect(api).toContain("hashPushEndpoint(endpoint)");
    expect(api).not.toContain("PWA_PUSH_ROLLOUT_ENABLED");
    expect(sql).not.toMatch(/update\s+private\.push_v4_runtime_settings/i);
    expect(vercel.crons??[]).toEqual([]);
  });
  it("limits attempts atomically and forbids public RPC access",()=>{
    expect(sql).toContain("on conflict (user_id) do update");
    expect(sql).toContain("interval '2 minutes'");
    expect(sql).toContain("interval '24 hours'");
    expect(sql).toContain("attempt_count < 5");
    expect(sql).toContain("where s.user_id=p_user_id and s.endpoint_hash=p_endpoint_hash");
    expect(sql).toContain("s.revoked_at is null");
    expect(sql).toContain("revoke all on function public.push_v4_claim_pilot_test(uuid,text)");
    expect(sql).toContain("grant execute on function public.push_v4_claim_pilot_test(uuid,text) to service_role");
    expect(sql).not.toMatch(/grant\s+execute[^;]*to\s+authenticated/i);
  });
  it("needs participant confirmation and never creates an OS",()=>{
    expect(ui).toContain("window.confirm(");
    expect(ui).toContain("config.pilotTestEnabled");
    expect(ui).toContain("sendPilotPushTest(userId)");
    expect(config).toContain('PWA_PUSH_PILOT_TEST_ENABLED === "true"');
    expect(worker).toContain('payload.kind === "pilot_test"');
    expect(worker).toContain('path: "/"');
    expect(sql).not.toMatch(/insert\s+into\s+public\.(os_orders|user_notifications)/i);
    expect(api).not.toContain("os_orders");
    expect(api).not.toContain("sendWebPush(");
  });
});
