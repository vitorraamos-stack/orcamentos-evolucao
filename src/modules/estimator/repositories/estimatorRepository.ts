import { supabase } from "@/lib/supabase";
import {
  officialEstimateApiRequestSchema,
  officialEstimatePublicResultSchema,
  estimatorFormApiRequestSchema,
  estimatorFormDefinitionSchema,
  type OfficialEstimatePublicResult,
  type OfficialEstimateRequest,
  type EstimatorFormDefinition,
} from "@shared/estimator";

type ApiError = Error & {
  code?: string;
  issues?: unknown[];
  status?: number;
};

async function accessToken() {
  let { data } = await supabase.auth.getSession();
  if (!data.session) data = (await supabase.auth.refreshSession()).data;
  if (!data.session) throw new Error("Sessão expirada. Faça login novamente.");
  return data.session.access_token;
}

async function post(body: unknown) {
  const response = await fetch("/api/pricing", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await accessToken()}`,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    const error = new Error(
      result?.error?.message ?? "Estimator request failed"
    ) as ApiError;
    error.code = result?.error?.code;
    error.issues = result?.error?.issues;
    error.status = response.status;
    throw error;
  }
  return result.data;
}

// Only cache the form's public, non-financial metadata, scoped by user.
// Official prices and permission checks always remain server-side.
const FORM_CACHE_TTL_MS = 30_000;
let cachedForm: {
  userId: string;
  expiresAt: number;
  definition: EstimatorFormDefinition;
} | null = null;
let pendingForm: {
  userId: string;
  promise: Promise<EstimatorFormDefinition>;
} | null = null;

async function fetchForm(productVersionId: string | null) {
  const body = estimatorFormApiRequestSchema.parse({
    action: "GET_ESTIMATOR_FORM",
    productVersionId,
  });
  return estimatorFormDefinitionSchema.parse(await post(body));
}

export const estimatorRepository = {
  loadForm: (
    productVersionId: string | null = null,
    userId: string | null = null
  ): Promise<EstimatorFormDefinition> => {
    // Historical versions always require a fresh server lookup.
    if (!userId || productVersionId !== null) return fetchForm(productVersionId);

    if (
      cachedForm?.userId === userId &&
      cachedForm.expiresAt > Date.now()
    ) {
      return Promise.resolve(cachedForm.definition);
    }

    if (pendingForm?.userId === userId) return pendingForm.promise;

    // Reopening the module shortly after leaving it can render immediately.
    // Failed requests are never cached, and cache data is never shared by users.
    const promise = fetchForm(null)
      .then(definition => {
        cachedForm = {
          userId,
          definition,
          expiresAt: Date.now() + FORM_CACHE_TTL_MS,
        };
        return definition;
      })
      .finally(() => {
        if (pendingForm?.promise === promise) pendingForm = null;
      });

    pendingForm = { userId, promise };
    return promise;
  },

  calculate: async (
    request: OfficialEstimateRequest
  ): Promise<OfficialEstimatePublicResult> => {
    const body = officialEstimateApiRequestSchema.parse({
      action: "CALCULATE_ESTIMATE",
      ...request,
    });
    return officialEstimatePublicResultSchema.parse(await post(body));
  },
};
