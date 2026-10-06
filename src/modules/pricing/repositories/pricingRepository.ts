import { supabase } from "@/lib/supabase";
import type {
  PricingPaymentTerm,
  PricingPersistenceMutation,
  PricingPolicy,
  PricingPolicyVersionDefinition,
  ProductPricingSettings,
} from "@shared/pricing";

export type PricingAdminPaymentContext = {
  source: "SYSTEM_ZERO" | "CONFIGURED";
  installments: number;
  rate: string;
  revision: number | null;
};

export type ProductPricingContext = {
  productSettings: ProductPricingSettings;
  policy: PricingPolicy;
  definition: PricingPolicyVersionDefinition;
  payment: PricingAdminPaymentContext;
};

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/pricing${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await accessToken()}`,
      ...init?.headers,
    },
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    const error = new Error(
      result?.error?.message ?? "Pricing request failed"
    ) as ApiError;
    error.code = result?.error?.code;
    error.issues = result?.error?.issues;
    error.status = response.status;
    throw error;
  }
  return result.data;
}

const mutate = <T>(command: PricingPersistenceMutation) =>
  request<T>("", { method: "POST", body: JSON.stringify(command) });

export const pricingRepository = {
  loadProductContext: (productId: string) =>
    request<ProductPricingContext>(
      `?contextProductId=${encodeURIComponent(productId)}`
    ),

  loadPaymentTerm: (installments: number) =>
    request<PricingPaymentTerm>(
      `?installments=${encodeURIComponent(String(installments))}`
    ),

  tryLoadPaymentTerm: async (installments: number) => {
    try {
      return await pricingRepository.loadPaymentTerm(installments);
    } catch (error) {
      const apiError = error as ApiError;
      if (
        apiError.status === 404 &&
        apiError.code === "PRICING_PAYMENT_TERM_NOT_FOUND"
      )
        return null;
      throw error;
    }
  },

  setProductPricing: (
    payload: Omit<
      Extract<PricingPersistenceMutation, { action: "SET_PRODUCT_PRICING" }>,
      "action"
    >
  ) =>
    mutate<ProductPricingSettings>({
      action: "SET_PRODUCT_PRICING",
      ...payload,
    }),

  setPaymentTerm: (
    payload: Omit<
      Extract<PricingPersistenceMutation, { action: "SET_PAYMENT_TERM" }>,
      "action"
    >
  ) =>
    mutate<PricingPaymentTerm>({
      action: "SET_PAYMENT_TERM",
      ...payload,
    }),

  publishMarkupChange: async (
    context: ProductPricingContext,
    markup: string
  ) => {
    const publishedVersion = context.definition.version;

    const created = await mutate<{
      pricingPolicyId: string;
      sourceVersionId: string;
      versionId: string;
      versionNumber: number;
      revision: 1;
    }>({
      action: "CREATE_VERSION",
      sourceVersionId: publishedVersion.id,
      expectedRevision: publishedVersion.revision,
    });

    const saved = await mutate<{ revision: number }>({
      action: "SAVE_DRAFT",
      versionId: created.versionId,
      expectedRevision: created.revision,
      markup,
      notes: `Markup atualizado pelo painel administrativo a partir da versão ${publishedVersion.versionNumber}.`,
    });

    const validating = await mutate<{
      version: { revision: number };
      issues: readonly unknown[];
    }>({
      action: "START_VALIDATION",
      versionId: created.versionId,
      expectedRevision: saved.revision,
    });

    return mutate<{
      version: { id: string; revision: number; status: string };
      issues: readonly unknown[];
    }>({
      action: "PUBLISH_VERSION",
      versionId: created.versionId,
      expectedRevision: validating.version.revision,
      expectedCurrentPublishedVersionId: publishedVersion.id,
    });
  },
};
