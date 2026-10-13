import { supabase } from "@/lib/supabase";
import {
  officialQuoteApiRequestSchema,
  officialQuotePublicResultSchema,
  quoteFormApiRequestSchema,
  quoteFormDefinitionSchema,
  type OfficialQuotePublicResult,
  type OfficialQuoteRequest,
  type QuoteFormDefinition,
} from "@shared/quotes";

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

export const quoteRepository = {
  loadForm: async (
    productVersionId: string | null = null
  ): Promise<QuoteFormDefinition> => {
    const body = quoteFormApiRequestSchema.parse({
      action: "GET_QUOTE_FORM",
      productVersionId,
    });
    return quoteFormDefinitionSchema.parse(await post(body));
  },

  calculate: async (
    request: OfficialQuoteRequest
  ): Promise<OfficialQuotePublicResult> => {
    const body = officialQuoteApiRequestSchema.parse({
      action: "CALCULATE_QUOTE",
      ...request,
    });
    return officialQuotePublicResultSchema.parse(await post(body));
  },
};
