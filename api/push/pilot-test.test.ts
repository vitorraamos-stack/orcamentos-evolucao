import { createECDH } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { handlePilotTest } from "./pilot-test";
import { hashPushEndpoint } from "../_shared/push/subscriptions";
import type { PilotTestStore } from "../_shared/push/pilotTestStore";
import type { PilotTestDevice, PushSendResult } from "../_shared/push/webPush";

const pair = createECDH("prime256v1");
pair.generateKeys();
const userId = "123e4567-e89b-42d3-a456-426614174111";
const endpoint = "https://fcm.googleapis.com/fcm/send/abc12345678901234567890123";
const device:PilotTestDevice = {
  endpoint,p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64,2)]).toString("base64url"),
  auth_secret:Buffer.alloc(16,4).toString("base64url"),
};
const env:NodeJS.ProcessEnv = {
  PWA_PUSH_REGISTRATION_ENABLED:"true",
  PWA_PUSH_PILOT_TEST_ENABLED:"true",
  PWA_PUSH_CANARY_USER_IDS:userId,
  PWA_PUSH_VAPID_PUBLIC_KEY:pair.getPublicKey().toString("base64url"),
  PWA_PUSH_VAPID_PRIVATE_KEY:Buffer.from(pair.getPrivateKey().toString("hex").padStart(64, "0"), "hex").toString("base64url"),
  PWA_PUSH_VAPID_SUBJECT:"mailto:push@example.com",
  PWA_PUSH_GENERATION_ENABLED:"false",PWA_PUSH_DELIVERY_ENABLED:"false",
  PWA_PUSH_ROLLOUT_ENABLED:"false",
};
const authorization = "Bearer " + "z".repeat(50);
const req = {method:"POST",headers:{authorization},body:{endpoint}};
function makeRes() {
  return {
    statusCode:200, headers:{} as Record<string,string>, body:{} as Record<string,unknown>,
    setHeader(name:string,value:string){this.headers[name]=value;},
    end(value:string){this.body=JSON.parse(value) as Record<string,unknown>;},
  };
}
function makeStore():PilotTestStore {
  return {
    getUser:vi.fn().mockResolvedValue(userId),
    claim:vi.fn().mockResolvedValue({status:"ready",device}),
    selectTarget:vi.fn().mockResolvedValue("selected"),
    claimRemote:vi.fn().mockResolvedValue({status:"ready",device}),
  };
}

describe("PWA V4 manual test — authorization and isolation",()=>{
  it("rejects GET requests, disabled feature and invalid tokens without claiming any device",async()=>{
    const store=makeStore(),sender=vi.fn();
    const get=makeRes();
    await handlePilotTest({...req,method:"GET"},get,{env,store,sender});
    expect(get.statusCode).toBe(405);
    const disabled=makeRes();
    await handlePilotTest(req,disabled,{env:{...env,PWA_PUSH_PILOT_TEST_ENABLED:"false"},store,sender});
    expect(disabled.statusCode).toBe(503);
    const missing=makeRes();
    await handlePilotTest({...req,headers:{}},missing,{env,store,sender});
    expect(missing.statusCode).toBe(401);
    expect(store.getUser).not.toHaveBeenCalled();
    expect(store.claim).not.toHaveBeenCalled();
    expect(sender).not.toHaveBeenCalled();
  });

  it("only allows logged-in canary identity, never userId supplied in JSON",async()=>{
    const store=makeStore(),sender=vi.fn();
    vi.mocked(store.getUser).mockResolvedValue("123e4567-e89b-42d3-a456-426614174222");
    const other=makeRes();
    await handlePilotTest({...req,body:{endpoint,userId}},other,{env,store,sender});
    expect(other.statusCode).toBe(403);
    expect(store.claim).not.toHaveBeenCalled();
    const bad=makeRes();
    await handlePilotTest({...req,body:{endpoint:"https://example.com/steal"}},bad,{env,store,sender});
    expect(bad.statusCode).toBe(400);
    expect(sender).not.toHaveBeenCalled();
  });

  it("claims only hash of the current endpoint, with verified user, and honors cooldown",async()=>{
    const store=makeStore(),sender=vi.fn();
    vi.mocked(store.claim).mockResolvedValueOnce({status:"rate_limited"});
    const tooFast=makeRes();
    await handlePilotTest(req,tooFast,{env,store,sender});
    expect(tooFast.statusCode).toBe(429);
    expect(sender).not.toHaveBeenCalled();
    expect(store.claim).toHaveBeenCalledWith(userId,hashPushEndpoint(endpoint));
    vi.mocked(store.claim).mockResolvedValueOnce({status:"not_found"});
    const missing=makeRes();
    await handlePilotTest(req,missing,{env,store,sender});
    expect(missing.statusCode).toBe(404);
    expect(sender).not.toHaveBeenCalled();
  });

  it("uses stored credentials, and only reports provider acceptance, never delivery proof",async()=>{
    const store=makeStore(),res=makeRes();
    const sender=vi.fn().mockResolvedValue({status:201,outcome:"sent"} satisfies PushSendResult);
    await handlePilotTest({...req,body:{endpoint,p256dh:"forged",auth_secret:"forged"}},res,
      {env,store,sender});
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ok:true,acceptedByProvider:true});
    expect(sender).toHaveBeenCalledWith(device,expect.objectContaining({
      publicKey:env.PWA_PUSH_VAPID_PUBLIC_KEY,
    }));
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(JSON.stringify(res.body)).not.toContain(device.endpoint);
    expect(JSON.stringify(res.body)).not.toContain(device.auth_secret);
  });

  it("fails closed when the provider rejects or Supabase fails",async()=>{
    const store=makeStore();
    const res=makeRes();
    await handlePilotTest(req,res,{env,store,sender:async()=>({status:429,outcome:"retry"})});
    expect(res.statusCode).toBe(502);
    vi.mocked(store.claim).mockRejectedValueOnce(new Error("sensitive endpoint"));
    const failure=makeRes();
    await handlePilotTest(req,failure,{env,store});
    expect(failure.statusCode).toBe(503);
    expect(JSON.stringify(failure.body)).not.toContain("sensitive");
  });
});
