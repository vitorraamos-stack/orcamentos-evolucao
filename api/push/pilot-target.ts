import {
  canRegisterPushUser, getBearer, hashPushEndpoint, isPushRegistrationEnabled,
  parseEndpointInput, parseJsonBody, type PushEnv,
} from "../_shared/push/subscriptions.js";
import {createPilotTestStore, type PilotTestStore} from "../_shared/push/pilotTestStore.js";

type RequestLike = {method?:string;headers?:Record<string,string|string[]|undefined>;body?:unknown};
type ResponseLike = {statusCode:number;setHeader(name:string,value:string):void;end(value:string):void};
function reply(res:ResponseLike,status:number,data:Record<string,unknown>) {
  res.statusCode=status;
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store");
  res.setHeader("Vary","Authorization");
  res.end(JSON.stringify(data));
}

/** Only the signed-in canary account can select its OWN registered browser endpoint.
 * This route never sends any message and never returns a device URL or key. */
export async function handlePilotTarget(
  req:RequestLike,res:ResponseLike,options:{env?:PushEnv;store?:PilotTestStore}={}
):Promise<void> {
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
  const endpoint=parseEndpointInput(parseJsonBody(req.body));
  if(!endpoint) {
    reply(res,400,{ok:false,code:"invalid_subscription"});
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
    const selected=await store.selectTarget(userId,hashPushEndpoint(endpoint));
    if(selected!=="selected") {
      reply(res,404,{ok:false,code:"device_not_registered"});
      return;
    }
    reply(res,200,{ok:true,selected:true});
  } catch {
    reply(res,503,{ok:false,code:"push_pilot_unavailable"});
  }
}
export default async function handler(req:RequestLike,res:ResponseLike){
  return handlePilotTarget(req,res);
}
