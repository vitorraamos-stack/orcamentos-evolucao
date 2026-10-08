import { supabase } from "@/lib/supabase";
import {
  officialQuoteApiRequestSchema,
  officialQuotePublicResultSchema,
  quoteCurrentPublicResultSchema,
  quoteGetApiRequestSchema,
  quoteHistoryApiRequestSchema,
  quoteHistoryResultSchema,
  quoteListApiRequestSchema,
  quoteListResultSchema,
  quoteSaveApiRequestSchema,
  quoteSavePublicResultSchema,
  quoteTransitionApiRequestSchema,
  quoteTransitionResultSchema,
  quoteFormApiRequestSchema,
  quoteFormDefinitionSchema,
  type OfficialQuotePublicResult,
  type OfficialQuoteRequest,
  type QuoteCurrentPublicResult,
  type QuoteId,
  type QuoteHistoryResult,
  type QuoteOutcomeReason,
  type QuoteListResult,
  type QuoteSavePublicResult,
  type QuoteSaveRequest,
  type QuoteStatus,
  type QuoteTransitionResult,
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

  list: async (input: {
    page: number;
    pageSize: number;
    search?: string | null;
    status?: QuoteStatus | null;
  }): Promise<QuoteListResult> => {
    const body = quoteListApiRequestSchema.parse({
      action: "LIST_QUOTES",
      page: input.page,
      pageSize: input.pageSize,
      search: input.search?.trim() || null,
      status: input.status ?? null,
    });
    return quoteListResultSchema.parse(await post(body));
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

  history: async (quoteId: QuoteId): Promise<QuoteHistoryResult> => {
    const body = quoteHistoryApiRequestSchema.parse({
      action: "GET_QUOTE_HISTORY",
      quoteId,
    });
    return quoteHistoryResultSchema.parse(await post(body));
  },

  transition: async (
    quoteId: QuoteId,
    expectedRevision: number,
    targetStatus: QuoteStatus,
    outcomeReason: QuoteOutcomeReason | null = null
  ): Promise<QuoteTransitionResult> => {
    const body = quoteTransitionApiRequestSchema.parse({
      action: "TRANSITION_QUOTE",
      quoteId,
      expectedRevision,
      targetStatus,
      outcomeReason,
    });
    return quoteTransitionResultSchema.parse(await post(body));
  },
};
