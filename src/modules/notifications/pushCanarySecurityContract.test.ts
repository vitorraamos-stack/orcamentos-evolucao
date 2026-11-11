import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read=(path:string)=>readFileSync(path,"utf8");
const helper=read("api/_shared/push/subscriptions.ts");
const post=read("api/push/subscriptions.ts");
const config=read("api/push/config.ts");
const client=read("src/modules/notifications/pushConsent.ts");
const view=read("src/components/notifications/PushNotificationPreferences.tsx");
const vercel=JSON.parse(read("vercel.json")) as {
  git: {deploymentEnabled:Record<string,boolean>};
  crons?:unknown[];
};

describe("Push V4 — pilot is fail-closed until users and credentials are provisioned",()=>{
  it("requires a valid, nonempty pilot set even when registration env flag is true",()=>{
    expect(helper).toContain("PWA_PUSH_CANARY_USER_IDS");
    expect(helper).toContain("pushCanaryUserIds(env).size > 0");
    expect(helper).toContain("ids.length > 5");
    expect(helper).toContain("new Set(ids).size !== ids.length");
  });
  it("checks server auth user, and never trusts userId in a browser body",()=>{
    expect(post).toContain("store.getUser(bearer)");
    expect(post).toContain("canRegisterPushUser(env, userId)");
    expect(post).toContain("push_canary_only");
    expect(post).toContain("store.revoke(userId, endpointHash)");
    expect(post).not.toMatch(/req\.body\.userId|body\.userId/);
  });
  it("does not reveal VAPID key or pilot list to unauthenticated/nonpilot users",()=>{
    expect(config).toContain("getBearer");
    expect(config).toContain("getUser(bearer)");
    expect(config).toContain("canRegisterPushUser");
    expect(config).toContain("reply(res, 200, false, null)");
    expect(config).not.toContain("PWA_PUSH_CANARY_USER_IDS");
    expect(config).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
  it("client supplies live JWT and only requests permission on user action",()=>{
    expect(client).toContain('Authorization: "Bearer " + token');
    expect(view).toContain("loadPushConfig(userId)");
    expect(view).toContain("Notification.requestPermission()");
    expect(client).not.toContain("Notification.requestPermission");
  });
  it("disables deployment previews and leaves cron disabled",()=>{
    expect(vercel.git.deploymentEnabled["feat/pwa-v4-canary-registration-20261111"]).toBe(false);
    expect(vercel.crons??[]).toEqual([]);
  });
});
