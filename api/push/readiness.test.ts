import { createECDH } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { handlePushReadiness } from "./readiness";
import { handlePushDispatch } from "./dispatch";
import type { PushDispatchStore } from "../_shared/push/dispatchStore";

const ecdh=createECDH("prime256v1");
ecdh.generateKeys();
const env:NodeJS.ProcessEnv={
  CRON_SECRET:"k".repeat(48),
  SUPABASE_SERVICE_ROLE_KEY:"test-service-key-not-a-real-secret",
  PWA_PUSH_REGISTRATION_ENABLED:"false",
  PWA_PUSH_ROLLOUT_ENABLED:"false",
  PWA_PUSH_GENERATION_ENABLED:"false",
  PWA_PUSH_DELIVERY_ENABLED:"false",
  PWA_PUSH_VAPID_SUBJECT:"mailto:push@example.com",
  PWA_PUSH_VAPID_PUBLIC_KEY:ecdh.getPublicKey().toString("base64url"),
  PWA_PUSH_VAPID_PRIVATE_KEY:ecdh.getPrivateKey().toString("base64url"),
};
const db={
  generationEnabled:false,deliveryEnabled:false,registrationRpcPresent:true,
  subscriptionsActive:2,pendingEvents:3,pendingJobs:1,
};
const store:PushDispatchStore={
  readiness:vi.fn().mockResolvedValue(db),
  expand:vi.fn().mockResolvedValue({expanded:0,jobsCreated:0}),
  claim:vi.fn().mockResolvedValue([]),
  eligible:vi.fn().mockResolvedValue(false),
  finish:vi.fn().mockResolvedValue(undefined),
};
function response(){
  const res:{statusCode:number;headers:Record<string,string>;body:any;
    setHeader:(name:string,value:string)=>void;end:(text:string)=>void}={
    statusCode:200,headers:{},body:null,
    setHeader(name,value){this.headers[name]=value;},
    end(text){this.body=JSON.parse(text);},
  };
  return res;
}
const header={authorization:"Bearer "+env.CRON_SECRET};

describe("PWA V4 — readiness and release gates",()=>{
  it("rejects unauthenticated preflight and unsupported methods",async()=>{
    const wrong=response();
    await handlePushReadiness({method:"GET"},wrong,{env,store});
    expect(wrong.statusCode).toBe(401);
    expect(store.readiness).not.toHaveBeenCalled();
    const post=response();
    await handlePushReadiness({method:"POST",headers:header},post,{env,store});
    expect(post.statusCode).toBe(405);
  });

  it("reports only aggregate readiness and remains read-only with all flags false",async()=>{
    const res=response();
    await handlePushReadiness({method:"GET",headers:header},res,{env,store});
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok:true,canDispatch:false,db,
      server:{rolloutEnabled:false,generationEnabled:false,deliveryEnabled:false,vapidValid:true}
    });
    expect(store.readiness).toHaveBeenCalledTimes(1);
    expect(store.expand).not.toHaveBeenCalled();
    expect(store.claim).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain(env.SUPABASE_SERVICE_ROLE_KEY);
    expect(JSON.stringify(res.body)).not.toContain(env.PWA_PUSH_VAPID_PRIVATE_KEY);
    expect(res.headers["Cache-Control"]).toBe("no-store");
  });

  it("requires BOTH database gates and the additional rollout switch",async()=>{
    const res=response();
    const allServer={...env,
      PWA_PUSH_ROLLOUT_ENABLED:"true",
      PWA_PUSH_GENERATION_ENABLED:"true",
      PWA_PUSH_DELIVERY_ENABLED:"true"
    };
    await handlePushReadiness({method:"GET",headers:header},res,{env:allServer,store});
    expect(res.body.canDispatch).toBe(false); // DB flags still off

    const active:PushDispatchStore={...store,
      readiness:vi.fn().mockResolvedValue({...db,generationEnabled:true,deliveryEnabled:true})
    };
    const ready=response();
    await handlePushReadiness({method:"GET",headers:header},ready,{env:allServer,store:active});
    expect(ready.body.canDispatch).toBe(true);

    const noCred=response();
    await handlePushReadiness({method:"GET",headers:header},noCred,{
      env:{...allServer,SUPABASE_SERVICE_ROLE_KEY:undefined},store:active
    });
    expect(noCred.body.canDispatch).toBe(false);
  });

  it("dispatch stays inert even when generation and delivery enabled but rollout switch off",async()=>{
    vi.clearAllMocks();
    const res=response();
    await handlePushDispatch({method:"GET",headers:header},res,{
      env:{...env,PWA_PUSH_GENERATION_ENABLED:"true",PWA_PUSH_DELIVERY_ENABLED:"true"},store
    });
    expect(res.body).toMatchObject({ok:true,enabled:false,sent:0});
    expect(store.expand).not.toHaveBeenCalled();
    expect(store.claim).not.toHaveBeenCalled();
  });

  it("fails closed without schema RPC and never reports database errors",async()=>{
    const failure:PushDispatchStore={...store,
      readiness:vi.fn().mockRejectedValue(new Error("private endpoint credentials"))
    };
    const res=response();
    await handlePushReadiness({method:"GET",headers:header},res,{env,store:failure});
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain("private endpoint");
    expect(JSON.stringify(res.body)).not.toContain(env.CRON_SECRET);
  });
});
