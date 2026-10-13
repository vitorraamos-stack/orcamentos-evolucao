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

export const estimatorRepository = {
  loadForm: async (
    productVersionId: string | null = null
  ): Promise<EstimatorFormDefinition> => {
    const body = estimatorFormApiRequestSchema.parse({
      action: "GET_ESTIMATOR_FORM",
      productVersionId,
    });
    return estimatorFormDefinitionSchema.parse(await post(body));
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
