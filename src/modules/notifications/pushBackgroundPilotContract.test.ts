import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const read=(path:string)=>readFileSync(path,"utf8");
const sql=read("supabase/migrations/20261116162000_pwa_v4_background_pilot_target.sql");
const select=read("api/push/pilot-target.ts");
const remote=read("api/push/pilot-remote-test.ts");
const ui=read("src/components/notifications/PushNotificationPreferences.tsx");
const js=read("src/modules/notifications/pushConsent.ts");
const vercel=JSON.parse(read("vercel.json")) as {crons?:unknown[]};

describe("Push V4 — manual background test guardrails",()=>{
  it("never enables operational generation, delivery or cron",()=>{
    expect(sql).not.toMatch(/update\s+private\.push_v4_runtime_settings/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.(os_orders|user_notifications)/i);
    expect(vercel.crons??[]).toEqual([]);
    expect(remote).not.toContain("sendWebPush(");
    expect(remote).not.toContain("PWA_PUSH_DELIVERY_ENABLED");
  });
  it("binds a user-selected ACTIVE device and reuses existing atomic quota",()=>{
    expect(sql).toContain("s.user_id = p_user_id and s.endpoint_hash = p_endpoint_hash");
    expect(sql).toContain("s.revoked_at is null");
    expect(sql).toContain("public.push_v4_claim_pilot_test(p_user_id, v_hash)");
    expect(sql).toContain("private.push_pilot_targets");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on function public.push_v4_claim_remote_pilot_test(uuid)");
    expect(sql).toContain("grant execute on function public.push_v4_claim_remote_pilot_test(uuid) to service_role");
    expect(sql).toContain("revoke all on function public.push_v4_set_pilot_target(uuid,text)");
    expect(sql).not.toMatch(/grant\s+execute[^;]*to\s+authenticated/i);
  });
  it("requires auth, canary, explicit clicks and rejects any remote-supplied destination",()=>{
    for(const route of [select,remote]){
      expect(route).toContain("getBearer");
      expect(route).toContain("canRegisterPushUser(env,userId)");
      expect(route).toContain('PWA_PUSH_PILOT_TEST_ENABLED!=="true"');
    }
    expect(remote).toContain("Object.keys(body).length!==0");
    expect(ui).toContain("window.confirm(");
    expect(ui).toContain("sendRemotePilotPushTest(userId)");
    expect(ui).toContain("selectPilotPushTestTarget(userId)");
    expect(js).toContain('"/api/push/pilot-remote-test"');
    expect(js).toContain('"/api/push/pilot-target"');
  });
});
