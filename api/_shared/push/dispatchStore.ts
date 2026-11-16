import { createClient } from "@supabase/supabase-js";
import { safePushJob, type PushJob, type PushSendResult } from "./webPush.js";

export type PushReleaseDbStatus = {
  generationEnabled: boolean;
  deliveryEnabled: boolean;
  registrationRpcPresent: boolean;
  subscriptionsActive: number;
  pendingEvents: number;
  pendingJobs: number;
};

export interface PushDispatchStore {
  readiness(): Promise<PushReleaseDbStatus>;
  expand(limit: number, allowedUserIds: readonly string[]): Promise<{ expanded: number; jobsCreated: number }>;
  claim(limit: number, allowedUserIds: readonly string[]): Promise<PushJob[]>;
  eligible(jobId: string, attemptNumber: number): Promise<boolean>;
  finish(jobId: string, attemptNumber: number, result: PushSendResult): Promise<void>;
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
    async readiness() {
      const { data, error } = await admin.rpc("push_v4_release_readiness");
      if (error || !data || typeof data !== "object" || Array.isArray(data))
        throw new Error("push_readiness_unavailable");
      const status = data as Record<string, unknown>;
      for (const name of ["generationEnabled","deliveryEnabled","registrationRpcPresent"]) {
        if (typeof status[name] !== "boolean") throw new Error("push_readiness_invalid");
      }
      for (const name of ["subscriptionsActive","pendingEvents","pendingJobs"]) {
        if (typeof status[name] !== "number" || !Number.isSafeInteger(status[name]) || (status[name] as number) < 0)
          throw new Error("push_readiness_invalid");
      }
      return status as unknown as PushReleaseDbStatus;
    },
    async expand(limit, allowedUserIds) {
      if (allowedUserIds.length < 1 || allowedUserIds.length > 5 ||
          allowedUserIds.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) ||
          new Set(allowedUserIds).size !== allowedUserIds.length)
        throw new Error("push_canary_configuration_missing");
      const { data, error } = await admin.rpc("push_v4_expand_canary_outbox", {
        p_limit: limit, p_allowed_user_ids: allowedUserIds,
      });
      if (error) throw new Error("push_expand_failed");
      const row = Array.isArray(data) ? data[0] : null;
      return {
        expanded: Number(row?.expanded_events ?? 0),
        jobsCreated: Number(row?.created_jobs ?? 0),
      };
    },
    async claim(limit, allowedUserIds) {
      // The original unrestricted RPC is never used by the pilot dispatcher.
      // The SQL RPC checks recipient/subscription ownership before leasing jobs.
      if (allowedUserIds.length < 1 || allowedUserIds.length > 5 ||
          allowedUserIds.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) ||
          new Set(allowedUserIds).size !== allowedUserIds.length)
        throw new Error("push_canary_configuration_missing");
      const { data, error } = await admin.rpc("push_v4_claim_canary_jobs", {
        p_limit: limit, p_allowed_user_ids: allowedUserIds,
      });
      if (error || !Array.isArray(data)) throw new Error("push_claim_failed");
      // Refuse unsafe outbound requests; return only known-safe records.
      // A malformed lease still remains recoverable; it will be discarded
      // after eligibility checks or a future maintenance job.
      if (data.some(job => !safePushJob(job))) throw new Error("push_claim_invalid");
      return data as PushJob[];
    },
    async eligible(jobId, attemptNumber) {
      const { data, error } = await admin.rpc("push_v4_job_eligible", {
        p_job_id: jobId, p_attempt_number: attemptNumber,
      });
      if (error) throw new Error("push_eligibility_failed");
      return data === true;
    },
    async finish(jobId, attemptNumber, result) {
      const { data, error } = await admin.rpc("push_v4_finish_job", {
        p_job_id: jobId,
        p_expected_attempt: attemptNumber,
        p_outcome: result.outcome,
        p_http_status: result.status,
      });
      if (error || data !== true) throw new Error("push_finish_failed");
    },
  };
}
