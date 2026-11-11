import { timingSafeEqual } from "node:crypto";
import { createPushDispatchStore, type PushDispatchStore } from "../_shared/push/dispatchStore";
import {
  sendWebPush, validateVapid, type VapId, type PushJob, type PushSendResult,
} from "../_shared/push/webPush";

type RequestLike = { method?: string; headers?: Record<string,string|string[]|undefined> };
type ResponseLike = {
  statusCode: number;
  setHeader(name:string,value:string):void;
  end(value:string):void;
};

export function authorizedCron(header: string | string[] | undefined, secret: unknown): boolean {
  if (typeof secret !== "string" || secret.length < 24 || typeof header !== "string") return false;
  const expected = Buffer.from("Bearer " + secret, "utf8");
  const incoming = Buffer.from(header, "utf8");
  return expected.length === incoming.length && timingSafeEqual(expected,incoming);
}

function json(res: ResponseLike,status:number,value:Record<string,unknown>) {
  res.statusCode=status;
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store");
  res.end(JSON.stringify(value));
}
function environmentVapid(env: NodeJS.ProcessEnv): VapId | null {
  const vapid = {
    subject: env.PWA_PUSH_VAPID_SUBJECT || "",
    publicKey: env.PWA_PUSH_VAPID_PUBLIC_KEY || "",
    privateKey: env.PWA_PUSH_VAPID_PRIVATE_KEY || "",
  };
  return validateVapid(vapid) ? vapid : null;
}

export async function handlePushDispatch(
  req: RequestLike,
  res: ResponseLike,
  options: {
    env?: NodeJS.ProcessEnv;
    store?: PushDispatchStore;
    sender?: (job: PushJob,vapid: VapId) => Promise<PushSendResult>;
  } = {}
): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow","GET");
    json(res,405,{ok:false,code:"method_not_allowed"});
    return;
  }
  const env=options.env ?? process.env;
  if (!authorizedCron(req.headers?.authorization ?? req.headers?.Authorization,env.CRON_SECRET)) {
    json(res,401,{ok:false,code:"unauthorized"});
    return;
  }
  // A separate database flag must ALSO be enabled. Configuring only Vercel
  // flags or only the migration can never activate delivery.
  if (env.PWA_PUSH_GENERATION_ENABLED !== "true" ||
      env.PWA_PUSH_DELIVERY_ENABLED !== "true") {
    json(res,200,{ok:true,enabled:false,expanded:0,claimed:0,sent:0});
    return;
  }
  const vapid = environmentVapid(env);
  if (!vapid) {
    json(res,503,{ok:false,code:"push_configuration_missing"});
    return;
  }
  const sender=options.sender ?? sendWebPush;
  let claimed=0;
  let sent=0;
  let expanded=0;
  let failed=0;
  let discarded=0;
  try {
    const store=options.store ?? createPushDispatchStore(env);
    const result=await store.expand(15);
    expanded=result.expanded;
    const jobs=await store.claim(4);
    claimed=jobs.length;
    // Two concurrent requests can only claim distinct jobs thanks to
    // FOR UPDATE SKIP LOCKED and leases. Limit work per invocation.
    for(let i=0;i<jobs.length;i+=2){
      await Promise.all(jobs.slice(i,i+2).map(async job=>{
        try {
          const eligible=await store.eligible(job.job_id);
          const outcome: PushSendResult=eligible
            ? await sender(job,vapid)
            : {status:null,outcome:"discarded"};
          await store.finish(job.job_id,outcome);
          if(outcome.outcome==="sent")sent++;
          if(outcome.outcome==="retry")failed++;
          if(outcome.outcome==="discarded")discarded++;
        } catch {
          failed++;
          // Failure to record the result leaves a short lease for retry.
          // Avoid leaking endpoints, device keys, token or message contents.
        }
      }));
    }
    json(res,200,{ok:true,enabled:true,expanded,claimed,sent,failed,discarded});
  } catch {
    json(res,503,{ok:false,code:"dispatch_unavailable",expanded,claimed,sent,failed,discarded});
  }
}
export default async function handler(req:RequestLike,res:ResponseLike){
  return handlePushDispatch(req,res);
}
