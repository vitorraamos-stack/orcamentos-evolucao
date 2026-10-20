import { supabase } from "@/lib/supabase";
import {
  publishedCommercialAdapterResultSchema,
  type PublishedCommercialAdapterResult,
} from "@shared/product-commercial-adapter";
import {
  commercialEligibilityApiRequestSchema,
  commercialEligibilityResultSchema,
  type CommercialEligibilityResult,
} from "@shared/product-commercial-eligibility";

type RemoteError = Error & { code?: string; status?: number };

async function authorizedRequest(url: string, options?: RequestInit) {
  let { data } = await supabase.auth.getSession();
  if (!data.session) data = (await supabase.auth.refreshSession()).data;
  if (!data.session) throw new Error("Sessão expirada. Faça login novamente.");
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${data.session.access_token}`,
    },
  });
  const body = await response.json();
  if (!response.ok || body.ok !== true) {
    const error = new Error(body?.error?.message ??
      "Não foi possível verificar a configuração.") as RemoteError;
    error.code = body?.error?.code;
    error.status = response.status;
    throw error;
  }
  return body.data;
}

export type CommercialEstimatorCheck = {
  adapter: PublishedCommercialAdapterResult;
  eligibility: CommercialEligibilityResult;
};

export async function checkCommercialEstimator(
  libraryProductId: string,
  commercialVersion: number,
  values: Record<string, unknown>,
  selectedComplementIds: string[],
  photosConfirmed: boolean
): Promise<CommercialEstimatorCheck> {
  const adapter = publishedCommercialAdapterResultSchema.parse(
    await authorizedRequest(
      "/api/product-commercial-adapter?libraryProductId=" +
      encodeURIComponent(libraryProductId)
    )
  );
  if (adapter.libraryProductId !== libraryProductId ||
      adapter.commercialVersion !== commercialVersion)
    throw new Error("A ficha foi atualizada. Atualize a Biblioteca antes de continuar.");

  const payload = commercialEligibilityApiRequestSchema.parse({
    action: "CHECK_COMMERCIAL_ELIGIBILITY",
    productId: adapter.productId,
    commercialVersion,
    values,
    selectedComplementIds,
    photosConfirmed,
  });
  const eligibility = commercialEligibilityResultSchema.parse(
    await authorizedRequest("/api/product-commercial-eligibility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
  if (eligibility.productId !== adapter.productId ||
      eligibility.libraryProductId !== libraryProductId ||
      eligibility.commercialVersion !== commercialVersion ||
      eligibility.engineeringVersion?.id !== adapter.engineeringVersion?.id)
    throw new Error("Os vínculos técnicos mudaram. Atualize o produto antes de continuar.");
  return { adapter, eligibility };
}
