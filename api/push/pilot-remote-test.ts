import {
  canRegisterPushUser, getBearer, isPushRegistrationEnabled, parseJsonBody,
  type PushEnv,
} from "../_shared/push/subscriptions.js";
import {createPilotTestStore, type PilotTestStore} from "../_shared/push/pilotTestStore.js";
import {
  sendPilotTestPush, validateVapid, type VapId, type PilotTestDevice,
  type PushSendResult,
} from "../_shared/push/webPush.js";

type RequestLike = {method?:string;headers?:Record<string,string|string[]|undefined>;body?:unknown};
type ResponseLike = {statusCode:number;setHeader(name:string,value:string):void;end(value:string):void};
function reply(res:ResponseLike,status:number,data:Record<string,unknown>) {
  res.statusCode=status;
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store");
  res.setHeader("Vary","Authorization");
  res.end(JSON.stringify(data));
}

/** User-initiated remote test ONLY for their explicitly preselected device.
 * Never choose a target supplied by this request; never act on GET or cron. */
export async function handleRemotePilotTest(
  req:RequestLike,res:ResponseLike,options:{
    env?:PushEnv;store?:PilotTestStore;
    sender?:(device:PilotTestDevice,vapid:VapId)=>Promise<PushSendResult>;
  }={}
):Promise<void>{
  if(req.method!=="POST") {
    res.setHeader("Allow","POST");
    reply(res,405,{ok:false,code:"method_not_allowed"});
    return;
  }
  const env=options.env??process.env;
  if(env.PWA_PUSH_PILOT_TEST_ENABLED!=="true" || !isPushRegistrationEnabled(env)) {
    reply(res,503,{ok:false,code:"pilot_test_disabled"});
    return;
  }
  const bearer=getBearer(req.headers?.authorization??req.headers?.Authorization);
  if(!bearer) {
    reply(res,401,{ok:false,code:"unauthorized"});
    return;
  }
  const body=parseJsonBody(req.body);
  // An arbitrary endpoint, userId, device ID or text is NEVER accepted.
  if(body!==null && (typeof body!=="object" || Array.isArray(body) || Object.keys(body).length!==0)) {
    reply(res,400,{ok:false,code:"unexpected_payload"});
    return;
  }
  const vapid:VapId={
    subject:env.PWA_PUSH_VAPID_SUBJECT??"",
    publicKey:env.PWA_PUSH_VAPID_PUBLIC_KEY??"",
    privateKey:env.PWA_PUSH_VAPID_PRIVATE_KEY??"",
  };
  if(!validateVapid(vapid)) {
    reply(res,503,{ok:false,code:"push_configuration_missing"});
    return;
  }
  try {
    const store=options.store??createPilotTestStore(env);
    const userId=await store.getUser(bearer);
    if(!userId) {
      reply(res,401,{ok:false,code:"unauthorized"});
      return;
    }
    if(!canRegisterPushUser(env,userId)) {
      reply(res,403,{ok:false,code:"push_canary_only"});
      return;
    }
    const claim=await store.claimRemote(userId);
    if(claim.status==="target_missing"){
      reply(res,404,{ok:false,code:"target_not_selected"});
      return;
    }
    if(claim.status==="not_found"){
      reply(res,404,{ok:false,code:"device_not_registered"});
      return;
    }
    if(claim.status==="rate_limited"){
      reply(res,429,{ok:false,code:"pilot_rate_limited"});
      return;
    }
    if(claim.status!=="ready"){
      reply(res,503,{ok:false,code:"push_pilot_unavailable"});
      return;
    }
    const outcome=await (options.sender??sendPilotTestPush)(claim.device,vapid);
    if(outcome.outcome!=="sent"){
      reply(res,502,{ok:false,code:"push_provider_unavailable"});
      return;
    }
    reply(res,200,{ok:true,acceptedByProvider:true});
  }catch{
    reply(res,503,{ok:false,code:"push_pilot_unavailable"});
  }
}
export default async function handler(req:RequestLike,res:ResponseLike){
  return handleRemotePilotTest(req,res);
}
