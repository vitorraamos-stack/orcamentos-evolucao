import { createECDH } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { authorizedCron, handlePushDispatch } from "./dispatch";
import type { PushDispatchStore } from "../_shared/push/dispatchStore";
import type { PushJob, PushSendResult } from "../_shared/push/webPush";

const pair=createECDH("prime256v1");
pair.generateKeys();
const env:NodeJS.ProcessEnv={
  CRON_SECRET:"c".repeat(48),
  PWA_PUSH_GENERATION_ENABLED:"true",
  PWA_PUSH_DELIVERY_ENABLED:"true",
  PWA_PUSH_ROLLOUT_ENABLED:"true",
  PWA_PUSH_VAPID_SUBJECT:"mailto:push@example.com",
  PWA_PUSH_VAPID_PUBLIC_KEY:pair.getPublicKey().toString("base64url"),
  PWA_PUSH_VAPID_PRIVATE_KEY:pair.getPrivateKey().toString("base64url"),
};
const headers={authorization:"Bearer "+env.CRON_SECRET};
const job:PushJob={
  job_id:"123e4567-e89b-42d3-a456-426614174001",
  order_id:"123e4567-e89b-42d3-a456-426614174002",
  kind:"production_released",
  endpoint:"https://fcm.googleapis.com/fcm/send/"+"a".repeat(28),
  p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64,1)]).toString("base64url"),
  auth_secret:Buffer.alloc(16,8).toString("base64url"),
  attempt_number:1,
};
function response(){
  const res:{statusCode:number;headers:Record<string,string>;body:Record<string,unknown>|null;
    setHeader:(name:string,value:string)=>void;end:(text:string)=>void}={
    statusCode:200,headers:{},body:null,
    setHeader(name,value){this.headers[name]=value;},
    end(text){this.body=JSON.parse(text) as Record<string,unknown>;},
  };
  return res;
}
function store(jobs:PushJob[]=[]):PushDispatchStore{
  return {
    readiness:vi.fn().mockResolvedValue({
      generationEnabled:false,deliveryEnabled:false,registrationRpcPresent:true,
      subscriptionsActive:0,pendingEvents:0,pendingJobs:0,
    }),
    expand:vi.fn().mockResolvedValue({expanded:2,jobsCreated:jobs.length}),
    claim:vi.fn().mockResolvedValue(jobs),
    eligible:vi.fn().mockResolvedValue(true),
    finish:vi.fn().mockResolvedValue(undefined),
  };
}
describe("PWA V4 2E — dispatch com flags independentes",()=>{
  it("rejeita qualquer acesso que não seja GET ou CRON_SECRET válido",async()=>{
    const s=store();
    const badMethod=response();
    await handlePushDispatch({method:"POST",headers},badMethod,{env,store:s});
    expect(badMethod.statusCode).toBe(405);
    const noSecret=response();
    await handlePushDispatch({method:"GET",headers:{authorization:"Bearer wrong"}},noSecret,{env,store:s});
    expect(noSecret.statusCode).toBe(401);
    expect(s.expand).not.toHaveBeenCalled();
    expect(authorizedCron("Bearer "+"c".repeat(48),env.CRON_SECRET)).toBe(true);
    expect(authorizedCron("Bearer "+"x".repeat(48),env.CRON_SECRET)).toBe(false);
    expect(authorizedCron("Bearer "+"c".repeat(48),"short")).toBe(false);
  });
  it("não executa RPCs quando o servidor mantém flags desligadas",async()=>{
    const s=store([job]),res=response(),sender=vi.fn();
    await handlePushDispatch({method:"GET",headers},res,{
      env:{...env,PWA_PUSH_DELIVERY_ENABLED:"false"},store:s,sender
    });
    expect(res.body).toEqual({ok:true,enabled:false,expanded:0,claimed:0,sent:0});
    expect(s.expand).not.toHaveBeenCalled();
    expect(sender).not.toHaveBeenCalled();
  });
  it("recusa VAPID ausente ou inconsistente",async()=>{
    const s=store(),res=response();
    await handlePushDispatch({method:"GET",headers},res,{
      env:{...env,PWA_PUSH_VAPID_PRIVATE_KEY:"broken"},store:s
    });
    expect(res.statusCode).toBe(503);
    expect(s.expand).not.toHaveBeenCalled();
  });
  it("expande eventos, checa elegibilidade e conclui jobs válidos",async()=>{
    const s=store([job]),res=response();
    const sender=vi.fn().mockResolvedValue({status:201,outcome:"sent"} satisfies PushSendResult);
    await handlePushDispatch({method:"GET",headers},res,{env,store:s,sender});
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ok:true,expanded:2,claimed:1,sent:1,failed:0,discarded:0});
    expect(s.eligible).toHaveBeenCalledWith(job.job_id,job.attempt_number);
    expect(sender).toHaveBeenCalledOnce();
    expect(s.finish).toHaveBeenCalledWith(job.job_id,job.attempt_number,{status:201,outcome:"sent"});
    expect(JSON.stringify(res.body)).not.toContain(job.endpoint);
    expect(res.headers["Cache-Control"]).toBe("no-store");
  });
  it("descarta jobs quando o usuário perdeu permissão, sem fazer requisição",async()=>{
    const s=store([job]),res=response(),sender=vi.fn();
    vi.mocked(s.eligible).mockResolvedValueOnce(false);
    await handlePushDispatch({method:"GET",headers},res,{env,store:s,sender});
    expect(sender).not.toHaveBeenCalled();
    expect(s.finish).toHaveBeenCalledWith(job.job_id,job.attempt_number,{status:null,outcome:"discarded"});
    expect(res.body).toMatchObject({discarded:1,sent:0});
  });
  it("não vaza erro interno ou segredo se banco falhar",async()=>{
    const s=store([job]),res=response();
    vi.mocked(s.expand).mockRejectedValueOnce(new Error("service-role-secret"));
    await handlePushDispatch({method:"GET",headers},res,{env,store:s});
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain("service-role-secret");
    expect(JSON.stringify(res.body)).not.toContain(env.CRON_SECRET);
  });
});
