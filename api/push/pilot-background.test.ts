import {createECDH} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {handlePilotTarget} from "./pilot-target";
import {handleRemotePilotTest} from "./pilot-remote-test";
import {hashPushEndpoint} from "../_shared/push/subscriptions";
import type {PilotTestStore} from "../_shared/push/pilotTestStore";
import type {PilotTestDevice} from "../_shared/push/webPush";

const pair=createECDH("prime256v1");pair.generateKeys();
const userId="123e4567-e89b-42d3-a456-426614174111";
const endpoint="https://fcm.googleapis.com/fcm/send/abc12345678901234567890123";
const device:PilotTestDevice={endpoint,p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64,2)]).toString("base64url"),
  auth_secret:Buffer.alloc(16,4).toString("base64url")};
const env:NodeJS.ProcessEnv={
  PWA_PUSH_REGISTRATION_ENABLED:"true",PWA_PUSH_PILOT_TEST_ENABLED:"true",
  PWA_PUSH_CANARY_USER_IDS:userId,
  PWA_PUSH_VAPID_PUBLIC_KEY:pair.getPublicKey().toString("base64url"),
  PWA_PUSH_VAPID_PRIVATE_KEY:Buffer.from(pair.getPrivateKey().toString("hex").padStart(64, "0"), "hex").toString("base64url"),
  PWA_PUSH_VAPID_SUBJECT:"mailto:push@example.com",
  PWA_PUSH_GENERATION_ENABLED:"false",PWA_PUSH_DELIVERY_ENABLED:"false",
};
const headers={authorization:"Bearer "+"z".repeat(50)};
const post={method:"POST",headers};
function makeRes() {
  return {statusCode:200,headers:{} as Record<string,string>,body:{} as Record<string,unknown>,
    setHeader(name:string,value:string){this.headers[name]=value;},
    end(data:string){this.body=JSON.parse(data) as Record<string,unknown>;}};
}
function store():PilotTestStore{
  return {getUser:vi.fn().mockResolvedValue(userId),
    claim:vi.fn().mockResolvedValue({status:"ready",device}),
    selectTarget:vi.fn().mockResolvedValue("selected"),
    claimRemote:vi.fn().mockResolvedValue({status:"ready",device})};
}

describe("PWA V4 remote background test — device selection",()=>{
  it("never selects on GET or when pilot feature is off",async()=>{
    const s=store(),get=makeRes();
    await handlePilotTarget({...post,method:"GET",body:{endpoint}},get,{env,store:s});
    expect(get.statusCode).toBe(405);
    const disabled=makeRes();
    await handlePilotTarget({...post,body:{endpoint}},disabled,{env:{...env,PWA_PUSH_PILOT_TEST_ENABLED:"false"},store:s});
    expect(disabled.statusCode).toBe(503);
    expect(s.getUser).not.toHaveBeenCalled();
  });
  it("requires a verified JWT and current user's own endpoint",async()=>{
    const s=store(),unauthorized=makeRes();
    await handlePilotTarget({method:"POST",body:{endpoint}},unauthorized,{env,store:s});
    expect(unauthorized.statusCode).toBe(401);
    const bad=makeRes();
    await handlePilotTarget({...post,body:{endpoint:"https://example.com/endpoint"}},bad,{env,store:s});
    expect(bad.statusCode).toBe(400);
    const wrongUser=makeRes();
    vi.mocked(s.getUser).mockResolvedValueOnce("123e4567-e89b-42d3-a456-426614174222");
    await handlePilotTarget({...post,body:{endpoint}},wrongUser,{env,store:s});
    expect(wrongUser.statusCode).toBe(403);
    expect(s.selectTarget).not.toHaveBeenCalled();
  });
  it("marks current subscription without pushing or exposing credentials",async()=>{
    const s=store(),response=makeRes();
    await handlePilotTarget({...post,body:{endpoint,userId:"forged"}},response,{env,store:s});
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ok:true,selected:true});
    expect(s.selectTarget).toHaveBeenCalledWith(userId,hashPushEndpoint(endpoint));
    expect(JSON.stringify(response.body)).not.toContain(endpoint);
  });
});

describe("PWA V4 remote background test — sending",()=>{
  it("rejects GET, disabled mode and payloads with arbitrary target",async()=>{
    const s=store(),sender=vi.fn();
    const get=makeRes();
    await handleRemotePilotTest({...post,method:"GET"},get,{env,store:s,sender});
    expect(get.statusCode).toBe(405);
    const off=makeRes();
    await handleRemotePilotTest({...post,body:{}},off,{env:{...env,PWA_PUSH_PILOT_TEST_ENABLED:"false"},store:s,sender});
    expect(off.statusCode).toBe(503);
    const forged=makeRes();
    await handleRemotePilotTest({...post,body:{endpoint,userId}},forged,{env,store:s,sender});
    expect(forged.statusCode).toBe(400);
    expect(s.claimRemote).not.toHaveBeenCalled();
    expect(sender).not.toHaveBeenCalled();
  });
  it("rejects non-canary or unauthenticated sessions before claiming destination",async()=>{
    const s=store(),sender=vi.fn();
    const missing=makeRes();
    await handleRemotePilotTest({method:"POST",body:{}},missing,{env,store:s,sender});
    expect(missing.statusCode).toBe(401);
    vi.mocked(s.getUser).mockResolvedValueOnce("123e4567-e89b-42d3-a456-426614174222");
    const other=makeRes();
    await handleRemotePilotTest({...post,body:{}},other,{env,store:s,sender});
    expect(other.statusCode).toBe(403);
    expect(s.claimRemote).not.toHaveBeenCalled();
  });
  it("does not send when target is missing, revoked or rate-limited",async()=>{
    const s=store(),sender=vi.fn();
    for(const [status,http] of [["target_missing",404],["not_found",404],["rate_limited",429]] as const) {
      vi.mocked(s.claimRemote).mockResolvedValueOnce({status});
      const res=makeRes();
      await handleRemotePilotTest({...post,body:{}},res,{env,store:s,sender});
      expect(res.statusCode).toBe(http);
    }
    expect(sender).not.toHaveBeenCalled();
  });
  it("uses only server-stored selected device, never claims success before physical receipt",async()=>{
    const s=store(),sender=vi.fn().mockResolvedValue({status:201,outcome:"sent"});
    const res=makeRes();
    await handleRemotePilotTest({...post,body:{}},res,{env,store:s,sender});
    expect(s.claimRemote).toHaveBeenCalledWith(userId);
    expect(sender).toHaveBeenCalledWith(device,expect.objectContaining({publicKey:env.PWA_PUSH_VAPID_PUBLIC_KEY}));
    expect(res.body).toEqual({ok:true,acceptedByProvider:true});
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(JSON.stringify(res.body)).not.toContain(endpoint);
  });
});
