import { supabase } from "@/lib/supabase";
import {
  officialQuoteApiRequestSchema,
  officialQuotePublicResultSchema,
  quoteCurrentPublicResultSchema,
  quoteGetApiRequestSchema,
  quoteSaveApiRequestSchema,
  quoteSavePublicResultSchema,
  quoteTransitionApiRequestSchema,
  quoteTransitionResultSchema,
  type OfficialQuotePublicResult,
  type OfficialQuoteRequest,
  type QuoteCurrentPublicResult,
  type QuoteId,
  type QuoteSavePublicResult,
  type QuoteSaveRequest,
  type QuoteStatus,
  type QuoteTransitionResult,
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
      result?.error?.message ?? "Quote request failed"
    ) as ApiError;
    error.code = result?.error?.code;
    error.issues = result?.error?.issues;
    error.status = response.status;
    throw error;
  }
  return result.data;
}

export const quoteRepository = {
  calculate: async (
    request: OfficialQuoteRequest
  ): Promise<OfficialQuotePublicResult> => {
    const body = officialQuoteApiRequestSchema.parse({
      action: "CALCULATE_QUOTE",
      ...request,
    });
    return officialQuotePublicResultSchema.parse(await post(body));
  },

  save: async (request: QuoteSaveRequest): Promise<QuoteSavePublicResult> => {
    const body = quoteSaveApiRequestSchema.parse({
      action: "SAVE_QUOTE",
      ...request,
    });
    return quoteSavePublicResultSchema.parse(await post(body));
  },

  load: async (quoteId: QuoteId): Promise<QuoteCurrentPublicResult> => {
    const body = quoteGetApiRequestSchema.parse({
      action: "GET_QUOTE",
      quoteId,
    });
    return quoteCurrentPublicResultSchema.parse(await post(body));
  },

  transition: async (
    quoteId: QuoteId,
    expectedRevision: number,
    targetStatus: QuoteStatus
  ): Promise<QuoteTransitionResult> => {
    const body = quoteTransitionApiRequestSchema.parse({
      action: "TRANSITION_QUOTE",
      quoteId,
      expectedRevision,
      targetStatus,
    });
    return quoteTransitionResultSchema.parse(await post(body));
  },
};
