import { authorizedCron } from "./dispatch";
import { createPushDispatchStore, type PushDispatchStore } from "../_shared/push/dispatchStore";
import { validateVapid } from "../_shared/push/webPush";
import { isPushRegistrationEnabled } from "../_shared/push/subscriptions";

type RequestLike = { method?: string; headers?: Record<string, string | string[] | undefined> };
type ResponseLike = { statusCode: number; setHeader(name:string,value:string):void; end(value:string):void };

function reply(res:ResponseLike,status:number,body:Record<string,unknown>) {
  res.statusCode=status;
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store");
  res.end(JSON.stringify(body));
}

/**
 * Read-only operational preflight, never writes an event or claims a job.
 * Restricted to CRON_SECRET. Returns only booleans, aggregates and errors.
 */
export async function handlePushReadiness(
  req:RequestLike,
  res:ResponseLike,
  options:{env?:NodeJS.ProcessEnv;store?:PushDispatchStore}={}
):Promise<void>{
  if(req.method!=="GET"){
    res.setHeader("Allow","GET");
    reply(res,405,{ok:false,code:"method_not_allowed"});
    return;
  }
  const env=options.env??process.env;
  if(!authorizedCron(req.headers?.authorization??req.headers?.Authorization,env.CRON_SECRET)){
    reply(res,401,{ok:false,code:"unauthorized"});
    return;
  }

  const vapidValid=validateVapid({
    subject:env.PWA_PUSH_VAPID_SUBJECT??"",
    publicKey:env.PWA_PUSH_VAPID_PUBLIC_KEY??"",
    privateKey:env.PWA_PUSH_VAPID_PRIVATE_KEY??"",
  });
  const server={
    registrationEnabled:isPushRegistrationEnabled(env),
    rolloutEnabled:env.PWA_PUSH_ROLLOUT_ENABLED==="true",
    generationEnabled:env.PWA_PUSH_GENERATION_ENABLED==="true",
    deliveryEnabled:env.PWA_PUSH_DELIVERY_ENABLED==="true",
    vapidValid,
    serviceCredentialConfigured:Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
  };
  try{
    const db=await (options.store??createPushDispatchStore(env)).readiness();
    const canDispatch=server.rolloutEnabled&&server.generationEnabled&&
      server.deliveryEnabled&&vapidValid&&server.serviceCredentialConfigured&&
      db.registrationRpcPresent&&db.generationEnabled&&db.deliveryEnabled;
    reply(res,200,{ok:true,canDispatch,server,db});
  }catch{
    reply(res,503,{ok:false,code:"push_readiness_unavailable",server});
  }
}

export default async function handler(req:RequestLike,res:ResponseLike){
  return handlePushReadiness(req,res);
}
