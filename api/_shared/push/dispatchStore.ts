import { createClient } from "@supabase/supabase-js";
import { safePushJob, type PushJob, type PushSendResult } from "./webPush";

export interface PushDispatchStore {
  expand(limit: number): Promise<{ expanded: number; jobsCreated: number }>;
  claim(limit: number): Promise<PushJob[]>;
  eligible(jobId: string): Promise<boolean>;
  finish(jobId: string, result: PushSendResult): Promise<void>;
}

/** Privileged RPCs only. The private schema is never added to the Data API. */
export function createPushDispatchStore(env: NodeJS.ProcessEnv): PushDispatchStore {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("push_db_configuration_missing");
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return {
    async expand(limit) {
      const { data, error } = await admin.rpc("push_v4_expand_outbox", { p_limit: limit });
      if (error) throw new Error("push_expand_failed");
      const row = Array.isArray(data) ? data[0] : null;
      return {
        expanded: Number(row?.expanded_events ?? 0),
        jobsCreated: Number(row?.created_jobs ?? 0),
      };
    },
    async claim(limit) {
      const { data, error } = await admin.rpc("push_v4_claim_jobs", { p_limit: limit });
      if (error || !Array.isArray(data)) throw new Error("push_claim_failed");
      // Refuse unsafe outbound requests; return only known-safe records.
      // A malformed lease still remains recoverable; it will be discarded
      // after eligibility checks or a future maintenance job.
      if (data.some(job => !safePushJob(job))) throw new Error("push_claim_invalid");
      return data as PushJob[];
    },
    async eligible(jobId) {
      const { data, error } = await admin.rpc("push_v4_job_eligible", { p_job_id: jobId });
      if (error) throw new Error("push_eligibility_failed");
      return data === true;
    },
    async finish(jobId, result) {
      const { data, error } = await admin.rpc("push_v4_finish_job", {
        p_job_id: jobId,
        p_outcome: result.outcome,
        p_http_status: result.status,
      });
      if (error || data !== true) throw new Error("push_finish_failed");
    },
  };
}
