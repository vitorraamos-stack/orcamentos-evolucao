import { createClient } from "@supabase/supabase-js";
import type { PushEnv } from "./subscriptions.js";
import type { PilotTestDevice } from "./webPush.js";

export type PilotClaim =
  | { status: "ready"; device: PilotTestDevice }
  | { status: "not_found" | "rate_limited" | "target_missing" };

export interface PilotTestStore {
  getUser(token: string): Promise<string | null>;
  claim(userId: string, endpointHash: string): Promise<PilotClaim>;
  selectTarget(userId: string, endpointHash: string): Promise<"selected" | "not_found">;
  claimRemote(userId: string): Promise<PilotClaim>;
}

/** Service-role calls only. The caller must authenticate JWT and enforce
 * the server-side allowlist before invoking claim. */
export function createPilotTestStore(env: PushEnv): PilotTestStore {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("push_pilot_unavailable");
  const client = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  return {
    async getUser(token) {
      const {data,error} = await client.auth.getUser(token);
      if(error || !data.user) return null;
      return data.user.id;
    },
    async claim(userId,endpointHash) {
      const {data,error} = await client.rpc("push_v4_claim_pilot_test",{
        p_user_id:userId,p_endpoint_hash:endpointHash,
      });
      if(error || !data || typeof data!=="object" || Array.isArray(data))
        throw new Error("push_pilot_unavailable");
      const value = data as Record<string,unknown>;
      if(value.status==="not_found" || value.status==="rate_limited")
        return {status:value.status};
      if(value.status==="ready" &&
         typeof value.endpoint==="string" &&
         typeof value.p256dh==="string" &&
         typeof value.auth_secret==="string")
        return {status:"ready",device:{
          endpoint:value.endpoint,p256dh:value.p256dh,auth_secret:value.auth_secret,
        }};
      throw new Error("push_pilot_unavailable");
    },
    async selectTarget(userId, endpointHash) {
      const {data,error} = await client.rpc("push_v4_set_pilot_target", {
        p_user_id:userId, p_endpoint_hash:endpointHash,
      });
      if (error || (data !== "selected" && data !== "not_found"))
        throw new Error("push_pilot_unavailable");
      return data;
    },
    async claimRemote(userId) {
      const {data,error} = await client.rpc("push_v4_claim_remote_pilot_test", {
        p_user_id:userId,
      });
      if (error || !data || typeof data !== "object" || Array.isArray(data))
        throw new Error("push_pilot_unavailable");
      const value = data as Record<string,unknown>;
      if (value.status === "target_missing" || value.status === "not_found" || value.status === "rate_limited")
        return {status:value.status};
      if (value.status === "ready" &&
          typeof value.endpoint === "string" &&
          typeof value.p256dh === "string" &&
          typeof value.auth_secret === "string")
        return {status:"ready",device:{
          endpoint:value.endpoint,p256dh:value.p256dh,auth_secret:value.auth_secret,
        }};
      throw new Error("push_pilot_unavailable");
    },
  };
}
