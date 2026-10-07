import { supabase } from "@/lib/supabase";
import {
  officialQuoteApiRequestSchema,
  officialQuotePublicResultSchema,
  type OfficialQuotePublicResult,
  type OfficialQuoteRequest,
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

export const quoteRepository = {
  calculate: async (
    request: OfficialQuoteRequest
  ): Promise<OfficialQuotePublicResult> => {
    const body = officialQuoteApiRequestSchema.parse({
      action: "CALCULATE_QUOTE",
      ...request,
    });
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
        result?.error?.message ?? "Quote calculation failed"
      ) as ApiError;
      error.code = result?.error?.code;
      error.issues = result?.error?.issues;
      error.status = response.status;
      throw error;
    }
    return officialQuotePublicResultSchema.parse(result.data);
  },
};
